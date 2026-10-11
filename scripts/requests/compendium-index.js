/**
 * @file Everything a player could request, read from the Item compendiums they can see. Takes a
 * moment like the system's item library does, so it's loaded on first use and cached for the
 * session.
 */

/** Item types the catalog offers. */
export const REQUESTABLE_TYPES = new Set([
  'specialability',
  'advantage',
  'disadvantage',
  'spell',
  'ritual',
  'liturgy',
  'ceremony',
  'spellextension',
  'blessing',
  'magictrick',
]);

/**
 * Only what the catalog and the cost estimate need. `system.category` is an object on special
 * abilities but a plain string on extensions, `system.talentValue` an object on spells but a number
 * (required FW) on extensions - fetching the whole field covers both.
 */
const INDEX_FIELDS = [
  'system.category',
  'system.APValue.value',
  'system.step.value',
  'system.maxRank.value',
  'system.max.value',
  'system.requirements.value',
  'system.StF.value',
  'system.talentValue',
  'system.source',
  'system.description.value',
  'system.obfuscation.description',
];

/** How many packs are indexed at once. */
const CONCURRENCY = 4;

/**
 * A requestable item, the same item from several packs merged into one.
 * @typedef {object} IndexEntry
 * @property {string} uuid
 * @property {string} name
 * @property {string} type
 * @property {string} img
 * @property {string[]} sources   The books it's in.
 * @property {string} searchText  The description as lowercase plain text, '' if obfuscated.
 * @property {object} system      The INDEX_FIELDS, without the description.
 */

/** The cached index. */
export default class RequestIndex {
  /** @type {?IndexEntry[]} */
  static #entries = null;
  /**
   * The library filter the entries were loaded with.
   * @type {?string}
   */
  static #filterKey = null;
  /** @type {?Promise<IndexEntry[]>} */
  static #loading = null;

  /**
   * The index, loaded or reloaded if the item library's module filter changed since.
   * @returns {Promise<IndexEntry[]>}
   */
  static async get() {
    const filter = game.settings.get('dsa5', 'libraryModulsFilter') ?? {};
    const filterKey = JSON.stringify(filter);
    if (this.#entries && this.#filterKey === filterKey) return this.#entries;
    if (this.#loading) return this.#loading;

    this.#loading = this.#load(filter)
      .then((entries) => {
        this.#entries = entries;
        this.#filterKey = filterKey;
        return entries;
      })
      .finally(() => {
        this.#loading = null;
      });
    return this.#loading;
  }

  /**
   * Indexes the packs the item library would use - visible to this user, not excluded by its module
   * filter - with a progress bar.
   * @param {Object<string, boolean>} filter   The library's module filter.
   * @returns {Promise<IndexEntry[]>}
   */
  static async #load(filter) {
    const packs = game.packs.filter(
      (pack) => pack.documentName === 'Item' && (game.user.isGM || pack.visible) && !filter[pack.metadata.packageName],
    );

    const progress = ui.notifications.info('STEIGERUNGSPLANER.Catalog.Loading', { localize: true, progress: true, console: false });
    const seen = new Map();
    const entries = [];
    const sourceNames = new Map();

    try {
      for (let i = 0; i < packs.length; i += CONCURRENCY) {
        const batch = packs.slice(i, i + CONCURRENCY);
        const indexes = await Promise.all(batch.map((pack) => pack.getIndex({ fields: INDEX_FIELDS })));

        batch.forEach((pack, j) => {
          const source = this.#sourceName(pack, sourceNames);
          for (const entry of indexes[j]) {
            if (!REQUESTABLE_TYPES.has(entry.type)) continue;

            // The same item often exists in several packs (core rules plus a book module) - keep the
            // first one, but list every book it's in.
            const key = `${entry.type}:${entry.name}`;
            const existing = seen.get(key);
            if (existing) {
              if (!existing.sources.includes(source)) existing.sources.push(source);
              continue;
            }

            // The description is only kept as plain search text - the details load the full item.
            // A copy without it, the index object itself is Foundry's cached pack index.
            const { description: rawDescription, ...system } = entry.system ?? {};
            const description = system.obfuscation?.description ? '' : rawDescription?.value;

            const item = {
              uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`,
              name: entry.name,
              type: entry.type,
              img: entry.img,
              sources: [source],
              searchText: this.#plainText(description),
              system,
            };
            seen.set(key, item);
            entries.push(item);
          }
        });

        progress.update({ pct: (i + batch.length) / packs.length });
      }
    } catch (err) {
      progress.remove?.();
      throw err;
    }

    // Removes itself at exactly 100 %, which the loop above never reaches without any packs.
    if (!packs.length) progress.update({ pct: 1 });
    return entries;
  }

  /** Decodes HTML without loading any of its images. */
  static #parser = new DOMParser();

  /**
   * A description as lowercase plain text for searching. Links like @UUID[...]{Finte} keep their
   * label.
   * @param {?string} html
   * @returns {string}
   */
  static #plainText(html) {
    if (!html) return '';
    const text = html.replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, '$1').replace(/@\w+\[([^\]]*)\]/g, '$1');
    const plain = this.#parser.parseFromString(text, 'text/html').body.textContent ?? '';
    return plain.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * The book a pack belongs to, named like the item library's module filter does it: the module's
   * translated name if it has one, otherwise its title. World packs fall back to the pack label.
   * @param {CompendiumCollection} pack
   * @param {Map<string, string>} cache   Names by package, for this load.
   * @returns {string}
   */
  static #sourceName(pack, cache) {
    const packageName = pack.metadata.packageName;
    if (cache.has(packageName)) return cache.get(packageName);

    let name;
    if (game.i18n.has(`${packageName}.name`)) name = game.i18n.localize(`${packageName}.name`);
    else if (packageName === game.system.id) name = game.system.title;
    else name = game.modules.get(packageName)?.title.replace(/The Dark Eye 5th Ed. - /i, '') || pack.metadata.label;

    cache.set(packageName, name);
    return name;
  }
}
