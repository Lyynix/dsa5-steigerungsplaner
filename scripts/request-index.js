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

// Only what the picker and the cost estimate need. `system.category` is an object on special
// abilities but a plain string on extensions, `system.talentValue` an object on spells but a
// number (required FW) on extensions - fetching the whole field covers both.
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
];

const CONCURRENCY = 4;

// Everything a player could request, crawled from the Item compendiums they can see. Takes a moment
// like the system's item library does, so it's loaded on first use and cached for the session.
export default class RequestIndex {
  static #entries = null;
  static #filterKey = null;
  static #loading = null;

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

  // Same pack selection as the item library: visible to this user, not excluded by its module filter.
  static async #load(filter) {
    const packs = game.packs.filter(
      (pack) => pack.documentName === 'Item' && (game.user.isGM || pack.visible) && !filter[pack.metadata.packageName],
    );

    const progress = ui.notifications.info('STEIGERUNGSPLANER.IndexLoading', { localize: true, progress: true, console: false });
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

            const item = {
              uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`,
              name: entry.name,
              type: entry.type,
              img: entry.img,
              sources: [source],
              system: entry.system ?? {},
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

  // The book a pack belongs to, named like the item library's module filter does it: the module's
  // own translated name if it has one, otherwise its title. World packs fall back to the pack label.
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
