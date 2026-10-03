import PlannerData from './planner-data.js';

const GROUP_ORDER = [
  'advantage',
  'disadvantage',
  'sf-general',
  'sf-combat',
  'sf-magical',
  'sf-clerical',
  'spell',
  'ritual',
  'magictrick',
  'liturgy',
  'ceremony',
  'blessing',
  'spellextension',
];

// Own labels throughout: the system's TYPES.Item.* are singular, the special ability groups are our
// own split, and "Zaubererweiterung" would be wrong for liturgy/ceremony extensions.
const GROUP_LABELS = {
  advantage: 'STEIGERUNGSPLANER.Group.advantage',
  disadvantage: 'STEIGERUNGSPLANER.Group.disadvantage',
  'sf-general': 'STEIGERUNGSPLANER.Group.sfGeneral',
  'sf-combat': 'STEIGERUNGSPLANER.Group.sfCombat',
  'sf-magical': 'STEIGERUNGSPLANER.Group.sfMagical',
  'sf-clerical': 'STEIGERUNGSPLANER.Group.sfClerical',
  spell: 'STEIGERUNGSPLANER.Group.spell',
  ritual: 'STEIGERUNGSPLANER.Group.ritual',
  magictrick: 'STEIGERUNGSPLANER.Group.magictrick',
  liturgy: 'STEIGERUNGSPLANER.Group.liturgy',
  ceremony: 'STEIGERUNGSPLANER.Group.ceremony',
  blessing: 'STEIGERUNGSPLANER.Group.blessing',
  spellextension: 'STEIGERUNGSPLANER.Group.extensions',
};

const MAGICAL_TYPES = new Set(['spell', 'ritual', 'magictrick']);
const CLERICAL_TYPES = new Set(['liturgy', 'ceremony', 'blessing']);

// Requests for items that need GM approval instead of being bought step by step (special
// abilities, spells, liturgies, ...). An entry looks like
//   { id, uuid, name, type, img, level, variant, costData, status }
// - uuid/name/type/img: taken from the request index
// - level: the wanted level for leveled special abilities/advantages, otherwise null
// - variant: the chosen variant (adoption), e.g. { name: 'Klettern', itemId: '...' }, otherwise
//   null. itemId is set when the variant is an item of the character - the system needs the real
//   item on approval, its StF can change the cost
// - costData: the item's cost fields (APValue, StF, ...) for the estimate, see requestCost
// - status: 'planned' or 'requested'
export default class RequestController {
  // What this character can request, from the request index: [{ id, label, entries }] in the picker's
  // order, empty groups left out. Each entry gets
  // - level: { min, max } for leveled special abilities/advantages, otherwise null
  // - variant: { kind: 'text' | 'list' | 'item', options, allowCustom } if it needs one, otherwise null
  // - extension: { source, requiredFW, currentFW } for extensions, otherwise null
  // - requirements: the item's requirements text, the system doesn't check it, the GM does
  static catalog(actor, entries) {
    const owned = new Map(actor.items.map((item) => [`${item.type}:${item.name}`, item]));
    const requested = new Set(PlannerData.getRequests(actor).map((r) => r.uuid));
    const groups = new Map(GROUP_ORDER.map((id) => [id, []]));

    for (const entry of entries) {
      const group = this.#groupFor(entry);
      if (!this.#allowedFor(actor, entry, group)) continue;

      const variant = this.#variantFor(actor, entry);

      // Items with a variant can be owned several times with different ones ("Begabung (Klettern)",
      // "Begabung (Schwimmen)"), so they're never filtered as owned or already requested.
      if (!variant && requested.has(entry.uuid)) continue;

      let level = null;
      const maxLevel = this.#maxLevel(entry);
      const ownedItem = variant ? null : owned.get(`${entry.type}:${entry.name}`);
      if (ownedItem) {
        const current = Number(ownedItem.system.step?.value) || 0;
        if (maxLevel <= 1 || current >= maxLevel) continue;
        level = { min: current + 1, max: maxLevel };
      } else if (maxLevel > 1) {
        level = { min: 1, max: maxLevel };
      }

      let extension = null;
      if (entry.type === 'spellextension') {
        const source = owned.get(`${entry.system.category}:${entry.system.source}`);
        if (!source) continue;
        extension = {
          source: entry.system.source,
          requiredFW: Number(entry.system.talentValue) || 0,
          currentFW: Number(source.system.talentValue?.value) || 0,
        };
      }

      groups.get(group).push({
        uuid: entry.uuid,
        name: entry.name,
        type: entry.type,
        img: entry.img,
        sources: entry.sources ?? [],
        searchText: entry.searchText ?? '',
        requirements: entry.system.requirements?.value ?? '',
        level,
        variant,
        extension,
      });
    }

    return GROUP_ORDER.filter((id) => groups.get(id).length).map((id) => ({
      id,
      label: game.i18n.localize(GROUP_LABELS[id]),
      entries: groups.get(id).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  // The system groups special ability categories itself (SpecialabilityData.sortedSpecs). It files
  // staff and ceremonial under "unused", but those are plainly magical and clerical.
  static #groupFor(entry) {
    if (entry.type !== 'specialability') return entry.type;

    const { magical, clerical, combat } = CONFIG.Item.dataModels.specialability.sortedSpecs;
    const category = entry.system.category?.value;
    if (magical.has(category) || category === 'staff') return 'sf-magical';
    if (clerical.has(category) || category === 'ceremonial') return 'sf-clerical';
    if (combat.has(category)) return 'sf-combat';
    return 'sf-general';
  }

  // Magical things only for magical characters, clerical ones only for blessed ones - the same
  // flags that decide whether the sheet shows its magic/religion tab. Advantages and disadvantages
  // stay open to everyone, otherwise nobody could ever request becoming a spellcaster.
  static #allowedFor(actor, entry, group) {
    const category = entry.type === 'spellextension' ? entry.system.category : null;
    const magical = MAGICAL_TYPES.has(entry.type) || group === 'sf-magical' || ['spell', 'ritual'].includes(category);
    const clerical = CLERICAL_TYPES.has(entry.type) || group === 'sf-clerical' || ['liturgy', 'ceremony'].includes(category);
    if (magical) return !!actor.system.isMage;
    if (clerical) return !!actor.system.isPriest;
    return true;
  }

  static #maxLevel(entry) {
    if (entry.type === 'specialability') return Number(entry.system.maxRank?.value) || 0;
    if (entry.type === 'advantage' || entry.type === 'disadvantage') return Number(entry.system.max?.value) || 0;
    return 0;
  }

  // Which items need a variant is registered at runtime by the content modules (dsa5-core etc.) in
  // the same tables the system's own adoption dialog reads. `items` is ["text"], ["array"] or a
  // list of item types - the system compares it loosely against 'text'/'array', so do we.
  static #variantFor(actor, entry) {
    const config = game.dsa5.config;
    const table = entry.type === 'specialability' ? config.AbilitiesNeedingAdaption : ['advantage', 'disadvantage'].includes(entry.type) ? config.vantagesNeedingAdaption : null;
    const rule = table?.[entry.name];
    if (!rule) return null;

    const kind = String(rule.items);
    if (kind === 'text') return { kind: 'text', options: [], allowCustom: false };
    if (kind === 'array') return { kind: 'list', options: (rule.elems ?? []).map((name) => ({ name })), allowCustom: false };

    const options = actor.items
      .filter((item) => rule.items.includes(item.type))
      .map((item) => ({ name: item.name, itemId: item.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { kind: 'item', options, allowCustom: !!rule.area };
  }

  // What buying the item would cost in AP, the way the system charges it: for leveled items from the
  // level the character has up to `level`, for spells and liturgies their activation. null if it
  // can't be told yet, e.g. a cost by StF while the variant isn't one of the character's items.
  // `item` is anything with type, name and system - an index entry or the full item.
  static estimateCost(actor, item, { level = null, variant = null } = {}) {
    const system = item.system;
    switch (item.type) {
      case 'spell':
      case 'ritual':
      case 'liturgy':
      case 'ceremony': {
        const costs = game.dsa5.config.advancementCosts[system.StF?.value];
        if (!costs) return null;
        let sum = 0;
        for (let i = 0; i <= (Number(system.talentValue?.value) || 0); i++) sum += costs[i];
        return sum;
      }
      case 'blessing':
      case 'magictrick':
        return 1;
      case 'spellextension':
        return this.#number(system.APValue?.value);
    }

    const costs = this.levelCosts(actor, item, variant);
    if (!costs) return null;
    const from = this.#ownedLevel(actor, item, variant);
    const to = level ?? from + 1;
    let sum = 0;
    for (let i = from; i < to; i++) {
      if (costs[i] === undefined) return null;
      sum += costs[i];
    }
    return sum;
  }

  // AP cost of each level of a special ability/advantage/disadvantage, [level 1, level 2, ...], or
  // null if it can't be told yet. APValue can be "10" (every level), "10;20;30" (per level),
  // "4/8/12/16" (by the variant's StF) or "5,10" (the first, second ... of that item) - the system
  // resolves them in this order when buying.
  static levelCosts(actor, item, variant = null) {
    let value = String(item.system.APValue?.value ?? '').trim();
    const base = item.name.replace(' ()', '');

    // Special abilities only count instances with the same variant, advantages count all of them.
    if (value.includes(',') && (variant || item.type !== 'specialability')) {
      const prefix = item.type === 'specialability' ? `${base} (${variant.name}` : base;
      const count = actor.items.filter((i) => i.type === item.type && i.name.includes(prefix)).length;
      value = value.split(',')[count]?.trim();
      if (!value) return null;
    }

    if (value.includes('/')) {
      const stf = variant?.itemId ? actor.items.get(variant.itemId)?.system.StF?.value : null;
      if (!stf) return null;
      value = value.split('/')[stf.charCodeAt(0) - 65]?.trim();
      if (!value) return null;
    }

    const costs = value.includes(';') ? value.split(';').map((v) => this.#number(v)) : null;
    if (costs) return costs.includes(null) ? null : costs;

    const cost = this.#number(value);
    if (cost === null) return null;
    return Array(Math.max(this.#maxLevel(item), 1)).fill(cost);
  }

  // The level the character already has of this item (with this variant), 0 if none.
  static #ownedLevel(actor, item, variant) {
    const base = item.name.replace(' ()', '');
    const name = variant ? `${base} (${variant.name}${variant.customEntry ? `, ${variant.customEntry}` : ''})` : item.name;
    const owned = actor.items.find((i) => i.type === item.type && i.name === name);
    return owned ? Number(owned.system.step?.value) || 0 : 0;
  }

  static #number(value) {
    const text = String(value ?? '').trim();
    const number = Number(text);
    return !text || Number.isNaN(number) ? null : number;
  }

  // The estimated cost of a planned request, see estimateCost. null for requests planned before
  // the cost data was stored with them.
  static requestCost(actor, request) {
    if (!request.costData) return null;
    return this.estimateCost(actor, { type: request.type, name: request.name, system: request.costData }, request);
  }

  // The fields estimateCost reads, kept with the request so the sheet can show its cost without
  // loading the item from its compendium.
  static #costData(system = {}) {
    const fields = ['APValue', 'StF', 'talentValue', 'maxRank', 'max'];
    return Object.fromEntries(fields.filter((f) => system[f] !== undefined).map((f) => [f, foundry.utils.deepClone(system[f])]));
  }

  // Returns the new entry, or null if the same item with the same variant is already in there.
  // `item` is the full item, its system data is needed for the cost.
  static async addRequest(actor, item, { level = null, variant = null } = {}) {
    if (!actor.isOwner) return null;

    const requests = PlannerData.getRequests(actor);
    const exists = requests.some((r) => r.uuid === item.uuid && (r.variant?.name ?? null) === (variant?.name ?? null));
    if (exists) return null;

    const entry = {
      id: foundry.utils.randomID(),
      uuid: item.uuid,
      name: item.name,
      type: item.type,
      img: item.img,
      level,
      variant,
      costData: this.#costData(item.system),
      status: 'planned',
    };
    requests.push(entry);
    await PlannerData.saveRequests(actor, requests);
    return entry;
  }

  // Named like the system names the item once a variant is chosen: "Fertigkeitsspezialisierung ()"
  // becomes "Fertigkeitsspezialisierung (Klettern)", or "(Klettern, Fassaden)" with an addition.
  static label(request) {
    if (!request.variant) return request.name;
    const { name, customEntry } = request.variant;
    return `${request.name.replace(' ()', '')} (${name}${customEntry ? `, ${customEntry}` : ''})`;
  }

  // Asking again clears an earlier rejection.
  static async markRequested(actor, id) {
    await this.#setStatus(actor, id, 'requested', { rejected: null });
  }

  // Takes a request back from the GM, it stays in the plan as planned.
  static async withdrawRequest(actor, id) {
    await this.#setStatus(actor, id, 'planned');
  }

  // Sends a request back to the player, with the GM's reason if they gave one.
  static async rejectRequest(actor, id, reason = '') {
    await this.#setStatus(actor, id, 'planned', { rejected: { reason } });
  }

  static async #setStatus(actor, id, status, changes = {}) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const entry = requests.find((r) => r.id === id);
    if (!entry || entry.status === status) return;

    Object.assign(entry, changes, { status });
    await PlannerData.saveRequests(actor, requests);
  }

  // Buys a request through the system's own functions, as if the GM dropped the item on the sheet
  // and picked the variant - so the AP check, deduction, item creation and the AP tracker work
  // exactly like that. The request is removed once the item is there at the wanted level. Returns
  // whether that worked; if not (usually not enough AP), the system has already said why.
  static async approveRequest(actor, id) {
    if (!actor.isOwner) return false;

    const request = PlannerData.getRequests(actor).find((r) => r.id === id);
    if (!request) return false;

    const source = await fromUuid(request.uuid);
    if (!source) {
      ui.notifications.error(game.i18n.format('STEIGERUNGSPLANER.ApproveMissingItem', { name: this.label(request) }));
      return false;
    }

    const bought = await this.#buy(actor, source, request);
    if (!bought) {
      ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.ApproveFailed', { name: this.label(request), actor: actor.name }));
      return false;
    }

    await this.removeRequest(actor, id);
    return true;
  }

  static async #buy(actor, source, request) {
    const data = game.items.fromCompendium(source);
    const { SpecialabilityRulesDSA5, AdvantageRulesDSA5 } = game.dsa5.apps;
    const owned = (name) => actor.items.find((i) => i.type === source.type && i.name === name);

    switch (source.type) {
      case 'spell':
      case 'ritual':
      case 'liturgy':
      case 'ceremony':
      case 'blessing':
      case 'magictrick':
        await actor.sheet._addSpellOrLiturgy(data);
        return !!owned(data.name);
      case 'spellextension':
        await actor.sheet._handleSpellExtension(data);
        return !!owned(data.name);
    }

    // Special abilities, advantages and disadvantages: the same functions the system's variant
    // dialog ends in, called with the stored variant so that dialog doesn't come up.
    const adoption = this.#adoption(actor, request.variant);
    const buy =
      source.type === 'specialability'
        ? () => SpecialabilityRulesDSA5._specialabilityReturnFunction(actor, data, source.type, adoption)
        : () => AdvantageRulesDSA5._vantageReturnFunction(actor, data, source.type, adoption);

    // The name the system gives the bought item - advantages don't take the addition.
    const base = data.name.replace(' ()', '');
    const custom = source.type === 'specialability' && adoption?.customEntry ? `, ${adoption.customEntry}` : '';
    const name = adoption ? `${base} (${adoption.name}${custom})` : data.name;
    const level = () => Number(owned(name)?.system.step.value) || 0;
    const target = request.level;

    // A new item is bought at the wanted level at once (the system sums up the levels' costs), an
    // owned one goes up one level per buy, like dropping it on the sheet again.
    if (!owned(name)) {
      if (target) data.system.step.value = target;
      await buy();
    }
    while (target && owned(name) && level() < target) {
      const before = level();
      await buy();
      if (level() === before) break;
    }

    return !!owned(name) && (!target || level() >= target);
  }

  // What the system's variant dialog would hand over: the chosen item of the character (its StF
  // can decide the cost) or just the entered name.
  static #adoption(actor, variant) {
    if (!variant) return null;
    const item = variant.itemId ? actor.items.get(variant.itemId) : null;
    const adoption = item ? { name: item.name, system: item.system } : { name: variant.name };
    if (variant.customEntry) adoption.customEntry = variant.customEntry;
    return adoption;
  }

  // Drops every request the character already has the item for, at the wanted level if it has one.
  static async pruneFulfilled(actor) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const remaining = requests.filter((r) => !this.#fulfilled(actor, r));
    if (remaining.length === requests.length) return;

    await PlannerData.saveRequests(actor, remaining);
  }

  static #fulfilled(actor, request) {
    const item = actor.items.find((i) => i.type === request.type && i.name === this.#itemName(request));
    if (!item) return false;
    return !request.level || (Number(item.system.step?.value) || 0) >= request.level;
  }

  // The name the system gives the bought item - advantages don't take the variant's addition.
  static #itemName(request) {
    if (!request.variant) return request.name;
    const base = request.name.replace(' ()', '');
    const custom = request.type === 'specialability' && request.variant.customEntry ? `, ${request.variant.customEntry}` : '';
    return `${base} (${request.variant.name}${custom})`;
  }

  static async removeRequest(actor, id) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const remaining = requests.filter((r) => r.id !== id);
    if (remaining.length === requests.length) return;

    await PlannerData.saveRequests(actor, remaining);
  }
}
