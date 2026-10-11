import PlannerController from './planner-controller.js';

// Hints when a planned step goes above the rule maximum the system checks when advancing for real
// ("Maximum erreicht"). No rules of our own: the maxima come from the system's own methods -
// _maxAllowedAdvancement of the item sheets (skills, combat techniques, spells, liturgies, incl.
// bonuses like exceptional skill) and pointAdvancementLimit (LeP/AsP/KaP). The system doesn't check
// attributes or rebuys, so they get no hint either.
//
// Two levels: 'attributes' - above the current maximum, but reachable with the attribute steps
// planned; 'over' - above it even then. Which planned attribute step helps, and which attribute
// would have to go how high, is found the same way: by asking the system's methods with stand-in
// attribute values. Only ever a hint, planning is never held back.

// How far an attribute is tried above its planned value when looking for what would help.
const SEARCH_RANGE = 10;

export default class PlannerLimits {
  // Marks a target's steps: step.limit = 'attributes' | 'over' | null and step.limitHint, for
  // increases only. Returns { limit, hint } of the worst one, null if none.
  static mark(actor, type, key, steps) {
    const limits = steps.some((s) => s.to > s.from) ? this.#limitsOf(actor, type, key) : null;
    let worst = null;
    for (const step of steps) {
      step.limit = null;
      step.limitHint = '';
      if (!limits || step.to <= step.from || step.to <= limits.current) continue;

      step.limit = step.to <= limits.planned ? 'attributes' : 'over';
      step.limitHint = limits.hint(step.to);
      if (!worst || step.limit === 'over') worst = step;
    }
    return worst ? { limit: worst.limit, hint: worst.limitHint } : null;
  }

  // The target's maxima - current and with the planned attribute steps - plus hint(value), the
  // tooltip for a step up to that value. null where the system has no maximum or it can't be told.
  static #limitsOf(actor, type, key) {
    let compute;
    let current;
    try {
      compute = this.#maximumOf(actor, type, key);
      if (!compute) return null;
      current = compute(actor);
    } catch (err) {
      // A system update changed what we call into - no hint rather than a broken tab.
      console.warn('dsa5-steigerungsplaner | maximum of', type, key, 'unavailable:', err);
      return null;
    }

    // From here on it's only about planned attribute values - if that fails, the hints just
    // don't know about them, the current maximum still holds.
    const values = this.#attributeValues(actor);
    let planned = current;
    try {
      planned = compute(this.#standIn(actor, values.planned));
    } catch (err) {
      console.warn('dsa5-steigerungsplaner | maximum with planned attributes of', type, key, 'unavailable:', err);
    }

    return {
      current,
      planned,
      // Names the target value and both maxima, so it's clear which one is meant.
      hint: (target) => {
        const data = { target, current, planned };
        try {
          if (target <= planned) {
            // No single planned step may raise it on its own, only several together.
            const steps = this.#helpingSteps(actor, compute, values, target);
            return game.i18n.format(steps ? 'STEIGERUNGSPLANER.Limit.Attributes' : 'STEIGERUNGSPLANER.Limit.AttributesAll', { ...data, steps });
          }
        } catch (err) {
          console.warn('dsa5-steigerungsplaner | attribute hint for', type, key, 'unavailable:', err);
        }

        const over = game.i18n.format(planned > current ? 'STEIGERUNGSPLANER.Limit.OverPlanned' : 'STEIGERUNGSPLANER.Limit.OverCurrent', data);
        let needed = '';
        try {
          needed = this.#neededAttributes(actor, compute, values, target);
        } catch (err) {
          console.warn('dsa5-steigerungsplaner | attribute hint for', type, key, 'unavailable:', err);
          return over;
        }
        const advice = needed ? game.i18n.format('STEIGERUNGSPLANER.Limit.Needs', { needed }) : game.i18n.localize('STEIGERUNGSPLANER.Limit.NoAttribute');
        return `${over} ${advice}`;
      },
    };
  }

  // A function working out the target's maximum for a given actor (the real one or a stand-in),
  // null where the system has none.
  static #maximumOf(actor, type, key) {
    if (type === 'point') {
      const limit = actor.system.pointAdvancementLimit;
      return typeof limit === 'function' ? (who) => limit.call(who.system, key) : null;
    }
    if (type !== 'item') return null;

    const item = actor.items.get(key);
    const sheet = item?.sheet;
    if (typeof sheet?._maxAllowedAdvancement !== 'function') return null;

    const { AdvantageRulesDSA5 } = game.dsa5.apps;
    const bonus = AdvantageRulesDSA5.vantageStep(actor, `${game.i18n.localize(sheet.advanceSkill)} (${item.name})`, false);
    return (who) => {
      if (who === actor) return sheet._maxAllowedAdvancement(bonus);
      // The same method, seeing the stand-in. Actor and item are handed over as plain properties:
      // the sheet's own getters read Foundry's private #document field, which a stand-in can't reach.
      return sheet._maxAllowedAdvancement.call(Object.create(sheet, { actor: { value: who }, item: { value: item } }), bonus);
    };
  }

  // { current, planned } attribute values, keyed like system.characteristics - planned being the
  // current value plus whatever steps are queued for it.
  static #attributeValues(actor) {
    const current = {};
    const planned = {};
    for (const [key, ch] of Object.entries(actor.system.characteristics ?? {})) {
      const delta = (PlannerController.chainEnd(actor, 'attribute', key) ?? 0) - (PlannerController.rawCurrentValue(actor, 'attribute', key) ?? 0);
      current[key] = ch.value;
      planned[key] = ch.value + delta;
    }
    return { current, planned };
  }

  // The actor with other attribute values - only what the maximum methods read
  // (system.characteristics) differs, everything else is the real actor. items as a plain property
  // too, for the same reason as the sheet's actor and item above.
  static #standIn(actor, values) {
    const characteristics = {};
    for (const [key, ch] of Object.entries(actor.system.characteristics ?? {})) {
      characteristics[key] = { ...ch, value: values[key] ?? ch.value };
    }
    const system = Object.create(actor.system, { characteristics: { value: characteristics } });
    return Object.create(actor, { system: { value: system }, items: { value: actor.items } });
  }

  // "KO 14": for each attribute with planned steps, the lowest value on the way that's enough for
  // target on its own - which can be short of the planned end ("KO 13 » 15" planned, KO 14 enough).
  // '' if only several planned attribute steps together are enough.
  static #helpingSteps(actor, compute, values, target) {
    const helping = [];
    for (const [key, planned] of Object.entries(values.planned)) {
      for (let value = values.current[key] + 1; value <= planned; value++) {
        if (compute(this.#standIn(actor, { ...values.current, [key]: value })) >= target) {
          helping.push(`${this.#abbr(key)} ${value}`);
          break;
        }
      }
    }
    return this.#orList(helping);
  }

  // "KO 16 oder KK 16": per attribute, the lowest value (starting from the planned ones) at which
  // the maximum reaches target. '' if no single attribute does within SEARCH_RANGE.
  static #neededAttributes(actor, compute, values, target) {
    const options = [];
    for (const [key, planned] of Object.entries(values.planned)) {
      for (let value = planned + 1; value <= planned + SEARCH_RANGE; value++) {
        if (compute(this.#standIn(actor, { ...values.planned, [key]: value })) >= target) {
          options.push({ key, value, raise: value - planned });
          break;
        }
      }
    }
    // The cheapest first.
    options.sort((a, b) => a.raise - b.raise);
    return this.#orList(options.map(({ key, value }) => `${this.#abbr(key)} ${value}`));
  }

  // "IN 16, KO 16 oder CH 16" - the browser knows how lists read in the user's language.
  static #orList(items) {
    return new Intl.ListFormat(game.i18n.lang, { type: 'disjunction' }).format(items);
  }

  static #abbr(key) {
    return game.i18n.localize(`CHARAbbrev.${key.toUpperCase()}`);
  }
}
