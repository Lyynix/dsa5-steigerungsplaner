import PlannerController from './planner-controller.js';
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
// Types with a FW, which can get planned steps on top of learning them.
const FW_TYPES = new Set(['spell', 'ritual', 'liturgy', 'ceremony']);

// Order of the request list in the planner tab: advantages, disadvantages, special abilities, then
// everything magical and everything clerical. Extensions go with the spell/liturgy they extend.
const LIST_GROUPS = {
  advantage: 0,
  disadvantage: 1,
  specialability: 2,
  spell: 3,
  ritual: 3,
  magictrick: 3,
  liturgy: 4,
  ceremony: 4,
  blessing: 4,
};

// Requests being approved on this client right now - pruneFulfilled leaves them to approveRequest,
// which turns the wanted FW into plan steps itself once the item is bought.
const approving = new Set();

// Requests for items that need GM approval instead of being bought step by step (special
// abilities, spells, liturgies, ...). An entry looks like
//   { id, uuid, name, type, img, level, variant, targetFW, extensionOf, costData, status }
// - uuid/name/type/img: taken from the request index
// - level: the wanted level for leveled special abilities/advantages, otherwise null
// - variant: the chosen variant (adoption), e.g. { name: 'Klettern', itemId: '...' }, otherwise
//   null. itemId is set when the variant is an item of the character - the system needs the real
//   item on approval, its StF can change the cost
// - targetFW: for spells, rituals, liturgies and ceremonies the FW the player wants to raise it to
//   after learning it, otherwise null. Only the player's own planning: the GM approves learning
//   it, then the steps up to it become regular plan entries
// - extensionOf: for extensions { type, name, requiredFW } of the spell/liturgy they extend,
//   otherwise null - see extensionState
// - costData: the item's cost fields (APValue, StF, ...) for the estimate, see requestCost
// - status: 'planned' or 'requested'
export default class RequestController {
  // What this character can request, from the request index: [{ id, label, entries }] in the picker's
  // order, empty groups left out. Each entry gets
  // - level: { min, max } for leveled special abilities/advantages, otherwise null
  // - variant: { kind: 'text' | 'list' | 'item', options, allowCustom } if it needs one, otherwise null
  // - extension: { source, requiredFW, currentFW, plannedFW } for extensions, otherwise null.
  //   The source is the spell/liturgy it extends, owned or only requested - currentFW is null for
  //   a requested one, plannedFW the FW it gets to with what's planned
  // - requirements: the item's requirements text, the system doesn't check it, the GM does
  static catalog(actor, entries) {
    const owned = new Map(actor.items.map((item) => [`${item.type}:${item.name}`, item]));
    const requests = PlannerData.getRequests(actor);
    const requested = new Set(requests.map((r) => r.uuid));
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
        const source = this.#extensionSource(actor, { type: entry.system.category, name: entry.system.source }, requests, owned);
        if (!source) continue;
        extension = { source: entry.system.source, requiredFW: Number(entry.system.talentValue) || 0, ...source };
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

  // The level buttons of a leveled request: [{ value, owned, selected, delta }] for every level up
  // to the item's max, or null if it has no levels (or was planned before the max was stored).
  // delta is how the planned cost would change if that level became the wanted one - positive above
  // it, negative below, null if the cost can't be told yet.
  static requestLevels(actor, request) {
    if (!request.level || !request.costData) return null;

    const item = { type: request.type, name: request.name, system: request.costData };
    const max = this.#maxLevel(item);
    if (max <= 1) return null;

    const owned = this.#ownedLevel(actor, item, request.variant);
    const costs = this.levelCosts(actor, item, request.variant);
    // costs[i] is what level i + 1 costs, so going from level a to b costs costs[a] .. costs[b - 1].
    const sum = (from, to) => {
      let total = 0;
      for (let i = from; i < to; i++) {
        if (costs?.[i] === undefined) return null;
        total += costs[i];
      }
      return total;
    };

    return Array.from({ length: max }, (_, i) => {
      const value = i + 1;
      const up = value >= request.level ? sum(request.level, value) : sum(value, request.level);
      return {
        value,
        owned: value <= owned,
        selected: value > owned && value <= request.level,
        delta: up === null ? null : value >= request.level ? up : -up,
      };
    });
  }

  // Where an extension's spell/liturgy stands: { currentFW, plannedFW } if the character has it
  // (plannedFW including the steps planned for it) or requested it (currentFW null, plannedFW the
  // request's target FW), null if neither.
  static #extensionSource(actor, { type, name }, requests = PlannerData.getRequests(actor), owned = null) {
    const item = owned ? owned.get(`${type}:${name}`) : actor.items.find((i) => i.type === type && i.name === name);
    if (item) {
      const currentFW = Number(item.system.talentValue?.value) || 0;
      return { currentFW, plannedFW: Math.max(currentFW, Number(PlannerController.chainEnd(actor, 'item', item.id)) || 0) };
    }
    const request = requests.find((r) => r.type === type && r.name === name);
    return request ? { currentFW: null, plannedFW: this.requestFW(request)?.target ?? 0 } : null;
  }

  // Whether an extension request can be sent to the GM - the system only buys an extension when the
  // spell/liturgy is there with a high enough FW, so there's no point in asking before. One of
  //   'ready', 'fwTooLow' (owned, FW below the requirement), 'notLearned' (only requested) or
  //   'missing' (neither owned nor requested anymore),
  // as { state, source, requiredFW, currentFW, plannedFW }. null for anything else and for requests
  // planned before the source was stored with them - those aren't held back.
  static extensionState(actor, request) {
    if (request.type !== 'spellextension' || !request.extensionOf) return null;

    const { name, requiredFW } = request.extensionOf;
    const source = this.#extensionSource(actor, request.extensionOf);
    const base = { source: name, requiredFW, currentFW: source?.currentFW ?? null, plannedFW: source?.plannedFW ?? null };
    if (!source) return { ...base, state: 'missing' };
    if (source.currentFW === null) return { ...base, state: 'notLearned' };
    return { ...base, state: source.currentFW >= requiredFW ? 'ready' : 'fwTooLow' };
  }

  // The FW part of a spell/liturgy request: { start, target, stepsCost }, start being the FW it's
  // learned at, stepsCost what raising it from there to target costs (null if that can't be told).
  // null for other types and for requests planned before the cost data was stored with them.
  static requestFW(request) {
    if (!FW_TYPES.has(request.type) || !request.costData) return null;

    const start = Number(request.costData.talentValue?.value) || 0;
    const target = Math.max(start, Number(request.targetFW) || start);
    return { start, target, stepsCost: this.#stepsCost(request.costData.StF?.value, start, target) };
  }

  // Raising a FW from a to a + 1 costs the cost table's entry a + 1, same as a regular planned step.
  static #stepsCost(stf, from, to) {
    const costs = game.dsa5.config.advancementCosts[stf];
    if (!costs) return null;
    let total = 0;
    for (let fw = from; fw < to; fw++) {
      if (costs[fw + 1] === undefined) return null;
      total += costs[fw + 1];
    }
    return total;
  }

  // Changes the FW a spell/liturgy request should be raised to after learning. Also while the GM
  // has it - they don't see it, it doesn't change what they approve.
  static async setTargetFW(actor, id, fw) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const entry = requests.find((r) => r.id === id);
    const current = entry && this.requestFW(entry);
    if (!current || !Number.isInteger(fw)) return;

    // Capped by the cost table, beyond it there's no cost to plan with.
    const max = (game.dsa5.config.advancementCosts[entry.costData.StF?.value]?.length ?? 1) - 1;
    const target = Math.min(Math.max(fw, current.start), Math.max(max, current.start));
    if (target === current.target) return;

    entry.targetFW = target;
    await PlannerData.saveRequests(actor, requests);
  }

  // Changes the wanted level of a planned request. Not while the GM has it, that would change what
  // they're approving - it has to be withdrawn first.
  static async setLevel(actor, id, level) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const entry = requests.find((r) => r.id === id);
    if (!entry?.level || entry.status !== 'planned' || entry.level === level) return;

    entry.level = level;
    await PlannerData.saveRequests(actor, requests);
  }

  // The fields estimateCost reads, kept with the request so the sheet can show its cost without
  // loading the item from its compendium.
  static #costData(system = {}) {
    const fields = ['APValue', 'StF', 'talentValue', 'maxRank', 'max'];
    return Object.fromEntries(fields.filter((f) => system[f] !== undefined).map((f) => [f, foundry.utils.deepClone(system[f])]));
  }

  // Returns the new entry, or null if the same item with the same variant is already in there.
  // `item` is the full item, its system data is needed for the cost.
  static async addRequest(actor, item, { level = null, variant = null, targetFW = null } = {}) {
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
      targetFW: FW_TYPES.has(item.type) ? Math.max(Number(item.system.talentValue?.value) || 0, Number(targetFW) || 0) : null,
      extensionOf:
        item.type === 'spellextension'
          ? { type: item.system.category, name: item.system.source, requiredFW: Number(item.system.talentValue) || 0 }
          : null,
      costData: this.#costData(item.system),
      status: 'planned',
    };
    requests.push(entry);
    await PlannerData.saveRequests(actor, requests);
    return entry;
  }

  // Which group of the planner tab's request list a request belongs to, see LIST_GROUPS. Extensions
  // planned before their source was stored with them count as magical.
  static listGroup(request) {
    const type = request.type === 'spellextension' ? (request.extensionOf?.type ?? 'spell') : request.type;
    return LIST_GROUPS[type] ?? Object.keys(LIST_GROUPS).length;
  }

  // Named like the system names the item once a variant is chosen: "Fertigkeitsspezialisierung ()"
  // becomes "Fertigkeitsspezialisierung (Klettern)", or "(Klettern, Fassaden)" with an addition.
  static label(request) {
    if (!request.variant) return request.name;
    const { name, customEntry } = request.variant;
    return `${request.name.replace(' ()', '')} (${name}${customEntry ? `, ${customEntry}` : ''})`;
  }

  // Asking again clears an earlier rejection. Extensions only once they can be bought.
  static async markRequested(actor, id) {
    const request = PlannerData.getRequests(actor).find((r) => r.id === id);
    const extension = request && this.extensionState(actor, request);
    if (extension && extension.state !== 'ready') return;
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

    approving.add(id);
    try {
      const bought = await this.#buy(actor, source, request);
      if (!bought) {
        ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.ApproveFailed', { name: this.label(request), actor: actor.name }));
        return false;
      }

      await this.#planTargetFW(actor, request);
      await this.removeRequest(actor, id);
      return true;
    } finally {
      approving.delete(id);
    }
  }

  // Once a spell/liturgy is learned, the FW the player wanted becomes regular plan entries on the
  // new item - the player applies them like any other steps.
  static async #planTargetFW(actor, request) {
    const fw = this.requestFW(request);
    if (!fw || fw.target <= fw.start) return;

    const item = actor.items.find((i) => i.type === request.type && i.name === this.#itemName(request));
    if (!item || Number(item.system.talentValue?.value) >= fw.target) return;
    await PlannerController.planTo(actor, 'item', item.id, fw.target);
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
  // A wanted FW is kept as plan steps, like on approval.
  static async pruneFulfilled(actor) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const fulfilled = requests.filter((r) => !approving.has(r.id) && this.#fulfilled(actor, r));
    if (!fulfilled.length) return;

    await PlannerData.saveRequests(actor, requests.filter((r) => !fulfilled.includes(r)));
    for (const request of fulfilled) await this.#planTargetFW(actor, request);
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
