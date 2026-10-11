/**
 * @file Logic of the plan: building, queueing, removing and applying steps, and keeping the plan in
 * line with real advances and refunds. A target is an attribute, a base stat, an item with a value
 * (skill, combat technique, spell, liturgy) or the rebuy of a permanent AsP/KaP loss.
 */

import { ADVANCE_FCTS, REFUND_FCTS } from '../config.js';
import PlannerData from './data.js';
import PlannerPhase from '../phase.js';

/** The plan's logic. All methods are static and work on the actor's flags. */
export default class PlannerController {
  /**
   * A shift-click on one of the sheet's "+"/"-" buttons. Clicking against the queue's direction
   * takes its last step back, otherwise one more step is queued.
   * @param {ActorSheet} sheet
   * @param {string} fct   The button's data-fct, see ADVANCE_FCTS and REFUND_FCTS.
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async handleShiftClick(sheet, fct, key) {
    const actor = sheet.actor;
    if (!actor.isOwner) return;

    let type, direction;
    if (fct in ADVANCE_FCTS) {
      type = ADVANCE_FCTS[fct];
      direction = 'increase';
    } else if (fct in REFUND_FCTS) {
      type = REFUND_FCTS[fct];
      direction = 'decrease';
    } else {
      return;
    }

    await this.ensureFresh(actor, type, key);

    const lastDirection = this.queueDirection(actor, type, key);

    if (lastDirection && lastDirection !== direction) {
      await this.cancelLast(actor, type, key);
    } else {
      await this.planStep(actor, type, key, direction);
    }

    sheet.render();
  }

  /**
   * The actor's spendable AP - what the system's checkEnoughXP compares a step's cost against.
   * @param {Actor} actor
   * @returns {number}
   */
  static availableXP(actor) {
    return Number(actor.system.details.experience.total) - Number(actor.system.details.experience.spent);
  }

  /**
   * Sets step.unaffordable on a target's steps, front to back with the AP running down. Once one
   * doesn't fit, all after it are unaffordable too - they can't be reached without it.
   * @param {Actor} actor
   * @param {PlanEntry[]} steps   Changed in place.
   */
  static markAffordability(actor, steps) {
    let remaining = this.availableXP(actor);
    let affordable = true;

    for (const step of steps) {
      affordable = affordable && step.cost <= remaining;
      if (affordable) remaining -= step.cost;
      step.unaffordable = !affordable;
    }
  }

  /**
   * The target's real current value, ignoring the plan.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {?number} null if the target doesn't exist.
   */
  static rawCurrentValue(actor, type, key) {
    if (type === 'attribute') {
      const ch = actor.system.characteristics[key];
      return ch ? ch.initial + ch.advances : null;
    }
    if (type === 'point') {
      const status = actor.system.status[key];
      return status ? status.advances : null;
    }
    if (type === 'item') {
      const item = actor.items.get(key);
      return item ? item.system.talentValue.value : null;
    }
    if (type === 'permanentLoss') {
      const status = actor.system.status[key];
      return status ? status.rebuy : null;
    }
    return null;
  }

  /**
   * The target's improvement cost (A-E). Animals use other ones for attributes and base stats.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {?string} null for rebuys, they have a flat cost.
   */
  static categoryFor(actor, type, key) {
    const isAnimal = actor.system.isPet || actor.system.isFamiliar;
    if (type === 'attribute') return isAnimal ? 'C' : 'E';
    if (type === 'point') return isAnimal ? 'C' : 'D';
    if (type === 'item') return actor.items.get(key)?.system.advanceCategory ?? null;
    return null;
  }

  /**
   * The target's display name.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {string}
   */
  static labelFor(actor, type, key) {
    if (type === 'attribute') return game.i18n.localize(`CHAR.${key.toUpperCase()}`);
    if (type === 'point') return game.i18n.localize(key);
    if (type === 'item') return actor.items.get(key)?.name ?? key;
    if (type === 'permanentLoss') {
      const abbrev = game.i18n.localize(key === 'astralenergy' ? 'CHARAbbrev.pAsP' : 'CHARAbbrev.pKaP');
      return game.i18n.format('STEIGERUNGSPLANER.Plan.Rebuy', { label: abbrev });
    }
    return key;
  }

  /**
   * The section a target is listed under in the tab, the overview and the value picker. Skills use
   * the system's own groups and gradient classes, the rest get ours (see the stylesheet).
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {{id: string, label: string, cssClass: string}}
   */
  static sectionFor(actor, type, key) {
    if (type === 'attribute') {
      return { id: 'characteristics', label: game.i18n.localize('STEIGERUNGSPLANER.Section.characteristics'), cssClass: 'steigerungsplaner-section-characteristics' };
    }
    // Rebuys share the section with the base stats - a character is never both magical and
    // clerical, so there's at most one of them.
    if (type === 'point' || type === 'permanentLoss') {
      return { id: 'points', label: game.i18n.localize('STEIGERUNGSPLANER.Section.points'), cssClass: 'steigerungsplaner-section-points' };
    }
    if (type === 'item') {
      const item = actor.items.get(key);
      if (item?.type === 'skill') {
        const group = item.system.group.value;
        return { id: `skill-${group}`, label: game.i18n.localize(`SKILL.${group}`), cssClass: group };
      }
      if (item?.type === 'combatskill') {
        return { id: 'combat', label: game.i18n.localize('TYPES.Item.combatskill'), cssClass: 'steigerungsplaner-section-combat' };
      }
      if (item?.type === 'spell') {
        return { id: 'magic', label: game.i18n.localize('TYPES.Item.spell'), cssClass: 'steigerungsplaner-section-magic' };
      }
      if (item?.type === 'liturgy') {
        return { id: 'religion', label: game.i18n.localize('TYPES.Item.liturgy'), cssClass: 'steigerungsplaner-section-religion' };
      }
    }
    return { id: 'other', label: game.i18n.localize('STEIGERUNGSPLANER.Section.other'), cssClass: 'steigerungsplaner-section-other' };
  }

  /**
   * The target's icon: the item's own, the attribute's d20, or a hand-picked one for base stats.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {?string}
   */
  static iconFor(actor, type, key) {
    if (type === 'attribute') return `systems/dsa5/icons/dice/d20${key}.svg`;
    if (type === 'point' || type === 'permanentLoss') {
      return {
        wounds: 'systems/dsa5/icons/talents/HeilkundeWunden.webp',
        astralenergy: 'systems/dsa5/icons/categories/ability_magical.webp',
        karmaenergy: 'systems/dsa5/icons/categories/ability_clerical.webp',
      }[key] ?? null;
    }
    if (type === 'item') return actor.items.get(key)?.img ?? null;
    return null;
  }

  /**
   * Where the target's queue ends - the value its next step starts from.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {?number} The last step's `to`, or the current value if nothing is queued.
   */
  static chainEnd(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.lastIndex(plan, type, key);
    return idx === -1 ? this.rawCurrentValue(actor, type, key) : plan[idx].to;
  }

  /**
   * The direction of the target's queue, taken from its last step.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {?('increase'|'decrease')} null if nothing is queued.
   */
  static queueDirection(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.lastIndex(plan, type, key);
    if (idx === -1) return null;
    return plan[idx].to > plan[idx].from ? 'increase' : 'decrease';
  }

  /**
   * The lowest value a real refund may bring the target down to - the same guards the system's
   * refund methods have, as a full value like rawCurrentValue.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {number}
   */
  static minValue(actor, type, key) {
    if (type === 'attribute') return actor.system.characteristics[key]?.initial ?? 0;
    if (type === 'point') return 0;
    if (type === 'item') return actor.items.get(key)?.system.advanceMin || 0;
    if (type === 'permanentLoss') return 0;
    return 0;
  }

  /**
   * Builds the target's next step, with the cost the system's _calculateAdvCost would charge.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @param {('increase'|'decrease')} direction
   * @param {?number} [from]   Defaults to the queue's end; planTo passes it while building several.
   * @returns {?PlanEntry} null if there's no such step (below the minimum, nothing to rebuy, ...).
   */
  static buildEntry(actor, type, key, direction, from = this.chainEnd(actor, type, key)) {
    if (from === null) return null;

    // Rebuys don't go through the cost table: _rebuyPC/_refundPC charge a flat 2 AP.
    if (type === 'permanentLoss') {
      if (direction === 'decrease') {
        if (from <= this.minValue(actor, type, key)) return null;
        return { id: foundry.utils.randomID(), type, key, label: this.labelFor(actor, type, key), from, to: from - 1, cost: -2, category: null };
      }
      // permanentLossSum only knows the rebuys bought for real. Worked out from `from` instead, so
      // planning several ahead stops once the whole loss is covered.
      const status = actor.system.status[key];
      if (!status || !(status.permanentLoss - from + status.permanentGear > 0)) return null;
      return { id: foundry.utils.randomID(), type, key, label: this.labelFor(actor, type, key), from, to: from + 1, cost: 2, category: null };
    }

    const category = this.categoryFor(actor, type, key);
    if (!category) return null;

    const DSA5_Utility = game.dsa5.apps.DSA5_Utility;

    if (direction === 'decrease') {
      if (from <= this.minValue(actor, type, key)) return null;
      const to = from - 1;
      const cost = DSA5_Utility._calculateAdvCost(from, category, 0) * -1;
      return { id: foundry.utils.randomID(), type, key, label: this.labelFor(actor, type, key), from, to, cost, category };
    }

    const to = from + 1;
    const cost = DSA5_Utility._calculateAdvCost(from, category, 1);
    return { id: foundry.utils.randomID(), type, key, label: this.labelFor(actor, type, key), from, to, cost, category };
  }

  /**
   * Discards the target's queue if its first step no longer starts from the current value, e.g.
   * after the value was typed in directly. Called before every click-driven change.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async ensureFresh(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx !== -1 && this.rawCurrentValue(actor, type, key) !== plan[idx].from) {
      await this.discardQueue(actor, type, key);
    }
  }

  /**
   * Targets with nothing planned yet that could be increased - for the value picker.
   * @param {Actor} actor
   * @returns {{type: string, key: string, label: string, icon: ?string, section: object}[]}
   */
  static candidateTargets(actor) {
    const planned = new Set(PlannerData.getPlan(actor).map((e) => `${e.type}:${e.key}`));
    const targets = Object.keys(actor.system.characteristics).map((key) => ['attribute', key]);

    targets.push(['point', 'wounds']);
    const { magical, clerical } = actor.system.guidevalue ?? {};
    if (actor.system.characteristics[magical]) targets.push(['point', 'astralenergy'], ['permanentLoss', 'astralenergy']);
    if (actor.system.characteristics[clerical]) targets.push(['point', 'karmaenergy'], ['permanentLoss', 'karmaenergy']);

    // Spell extensions have a talentValue too, but as a plain number - hence `.value`.
    const items = actor.items.filter((item) => item.system.talentValue?.value !== undefined);
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) targets.push(['item', item.id]);

    return targets
      .filter(([type, key]) => !planned.has(`${type}:${key}`) && this.buildEntry(actor, type, key, 'increase'))
      .map(([type, key]) => ({
        type,
        key,
        label: this.labelFor(actor, type, key),
        icon: this.iconFor(actor, type, key),
        section: this.sectionFor(actor, type, key),
      }));
  }

  /**
   * The tab's "+" on a row: one more step in the queue's direction.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async appendStep(actor, type, key) {
    if (!actor.isOwner) return;
    await this.ensureFresh(actor, type, key);

    const direction = this.queueDirection(actor, type, key);
    if (!direction) return;
    await this.planStep(actor, type, key, direction);
  }

  /**
   * Plans the target so it ends at `target` - a value typed into the sheet. Steps already leading
   * there stay, steps past it or the other way go, missing ones are added, all saved at once. The
   * current value as target clears the queue.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @param {number} target
   * @returns {Promise<void>}
   */
  static async planTo(actor, type, key, target) {
    if (!actor.isOwner) return;
    await this.ensureFresh(actor, type, key);

    const current = this.rawCurrentValue(actor, type, key);
    if (current === null || !Number.isInteger(target)) return;
    const direction = target > current ? 'increase' : target < current ? 'decrease' : null;
    const beyond = (value) => (direction === 'increase' ? value > target : value < target);

    const plan = PlannerData.getPlan(actor);
    const own = plan.filter((e) => e.type === type && e.key === key);
    const keep = [];
    for (const entry of own) {
      const entryDirection = entry.to > entry.from ? 'increase' : 'decrease';
      if (entryDirection !== direction || beyond(entry.to)) break;
      keep.push(entry);
    }

    const dropped = new Set(own.slice(keep.length).map((e) => e.id));
    const next = plan.filter((e) => !dropped.has(e.id));

    let from = keep.length ? keep[keep.length - 1].to : current;
    while (direction && from !== target) {
      const entry = this.buildEntry(actor, type, key, direction, from);
      if (!entry) {
        if (direction === 'decrease') {
          ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.Plan.CannotDecrease', { label: this.labelFor(actor, type, key) }));
        }
        break;
      }
      entry.sinceConsume = true;
      next.push(entry);
      from = entry.to;
    }

    if (dropped.size || next.length !== plan.length) await PlannerData.savePlan(actor, next);
  }

  /**
   * Queues one step. Warns if a decrease isn't possible.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @param {('increase'|'decrease')} direction
   * @returns {Promise<void>}
   */
  static async planStep(actor, type, key, direction) {
    const entry = this.buildEntry(actor, type, key, direction);
    if (!entry) {
      if (direction === 'decrease') {
        ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.Plan.CannotDecrease', { label: this.labelFor(actor, type, key) }));
      }
      return;
    }
    // Planned after this target's last consume - a fresh commitment, see pruneConsumed.
    entry.sinceConsume = true;
    const plan = PlannerData.getPlan(actor);
    plan.push(entry);
    await PlannerData.savePlan(actor, plan);
  }

  /**
   * Removes a step and all of the target's steps after it - they can't stay valid without it. The
   * X on a step tile and the trash icon of a row.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @param {string} entryId
   * @returns {Promise<void>}
   */
  static async cancelFrom(actor, type, key, entryId) {
    if (!actor.isOwner) return;
    await this.ensureFresh(actor, type, key);

    const plan = PlannerData.getPlan(actor);
    const own = plan.filter((e) => e.type === type && e.key === key);
    const cutIdx = own.findIndex((e) => e.id === entryId);
    if (cutIdx === -1) return;

    const toRemove = new Set(own.slice(cutIdx).map((e) => e.id));
    const remaining = plan.filter((e) => !toRemove.has(e.id));
    await PlannerData.savePlan(actor, remaining);
  }

  /**
   * Removes the target's last step.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async cancelLast(actor, type, key) {
    if (!actor.isOwner) return;
    await this.ensureFresh(actor, type, key);

    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.lastIndex(plan, type, key);
    if (idx === -1) {
      ui.notifications.warn(game.i18n.localize('STEIGERUNGSPLANER.Plan.NothingPlanned'));
      return;
    }
    plan.splice(idx, 1);
    await PlannerData.savePlan(actor, plan);
  }

  /**
   * Brings the plan in line after a real advance or refund - from the planner or a normal click on
   * the sheet (see the wraps in sheet/integration.js). Checked in order:
   * 1. The queue's first step expected exactly this change: it's consumed - taken off the plan and
   *    put on the target's consumed stack.
   * 2. The last consumed step started at this value: the player undid it for real, it goes back to
   *    the front of the plan.
   * 3. Neither: the queue assumes a value that no longer holds and is discarded.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @param {number} valueAfterChange   The target's real value right after the change.
   * @returns {Promise<void>}
   */
  static async reconcile(actor, type, key, valueAfterChange) {
    const plan = PlannerData.getPlan(actor);
    const frontIdx = PlannerData.firstIndex(plan, type, key);
    const front = frontIdx === -1 ? null : plan[frontIdx];

    if (front && front.to === valueAfterChange) {
      plan.splice(frontIdx, 1);
      // What's still queued now is the remainder of what was planned before this consume.
      for (const entry of plan) {
        if (entry.type === type && entry.key === key) entry.sinceConsume = false;
      }
      await PlannerData.savePlan(actor, plan);

      const consumed = PlannerData.getConsumed(actor);
      consumed.push(front);
      await PlannerData.saveConsumed(actor, consumed);
      return;
    }

    const consumed = PlannerData.getConsumed(actor);
    const topIdx = PlannerData.lastIndex(consumed, type, key);
    const top = topIdx === -1 ? null : consumed[topIdx];

    if (top && top.from === valueAfterChange) {
      consumed.splice(topIdx, 1);
      await PlannerData.saveConsumed(actor, consumed);

      top.sinceConsume = false;
      const insertAt = PlannerData.firstIndex(plan, type, key);
      if (insertAt === -1) plan.push(top);
      else plan.splice(insertAt, 0, top);
      await PlannerData.savePlan(actor, plan);
      return;
    }

    await this.discardQueue(actor, type, key);
  }

  /**
   * Discards the target's queue and its consumed steps - undoing an older step would have to match
   * values that no longer exist. Warns that the value changed outside the planner.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @param {object} [options]
   * @param {boolean} [options.silent=false]   No warning, for a deliberate discard by the user.
   * @returns {Promise<void>}
   */
  static async discardQueue(actor, type, key, { silent = false } = {}) {
    await this.#dropConsumed(actor, type, key);

    const plan = PlannerData.getPlan(actor);
    const remaining = plan.filter((e) => !(e.type === type && e.key === key));
    if (remaining.length === plan.length) return;

    await PlannerData.savePlan(actor, remaining);
    if (!silent) {
      ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.Plan.Discarded', { label: this.labelFor(actor, type, key) }));
    }
  }

  /**
   * Removes the target's consumed steps.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async #dropConsumed(actor, type, key) {
    const consumed = PlannerData.getConsumed(actor);
    const remaining = consumed.filter((e) => !(e.type === type && e.key === key));
    if (remaining.length !== consumed.length) await PlannerData.saveConsumed(actor, remaining);
  }

  /**
   * After a value was set directly (the GM's Ctrl+Enter, or the fields with planning off): steps the
   * new value covers are done and go quietly, the rest stays if it continues from there. A value
   * off the planned chain discards the queue with the usual warning. The consumed steps go either
   * way - a direct set isn't a step that undoing could restore.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async rebaseQueue(actor, type, key) {
    if (!actor.isOwner) return;

    const value = this.rawCurrentValue(actor, type, key);
    const plan = PlannerData.getPlan(actor);
    const own = plan.filter((e) => e.type === type && e.key === key);
    if (!own.length) return this.#dropConsumed(actor, type, key);

    const start = own.findIndex((e) => e.from === value);
    const reached = own[own.length - 1].to === value;
    if (start === -1 && !reached) return this.discardQueue(actor, type, key);

    await this.#dropConsumed(actor, type, key);
    const done = new Set((start === -1 ? own : own.slice(0, start)).map((e) => e.id));
    if (done.size) await PlannerData.savePlan(actor, plan.filter((e) => !done.has(e.id)));
  }

  /**
   * When the sheet closes: drops a target's consumed steps once undoing them no longer makes sense -
   * nothing is queued anymore, or something was planned on top since the last consume. Until then
   * undoing works, even after reopening the sheet. Steps without sinceConsume (older versions)
   * count as remainder.
   * @param {Actor} actor
   * @returns {Promise<void>}
   */
  static async pruneConsumed(actor) {
    if (!actor.isOwner) return;

    const consumed = PlannerData.getConsumed(actor);
    if (!consumed.length) return;

    const plan = PlannerData.getPlan(actor);
    const stale = (entry) => {
      const queued = plan.filter((e) => e.type === entry.type && e.key === entry.key);
      return !queued.length || queued.some((e) => e.sinceConsume === true);
    };

    const remaining = consumed.filter((entry) => !stale(entry));
    if (remaining.length !== consumed.length) await PlannerData.saveConsumed(actor, remaining);
  }

  /**
   * Removes everything planned and consumed for a target that's gone, e.g. a deleted item. No
   * notification - the player deleted it themselves.
   * @param {Actor} actor
   * @param {string} type
   * @param {string} key
   * @returns {Promise<void>}
   */
  static async purgeTarget(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const remainingPlan = plan.filter((e) => !(e.type === type && e.key === key));
    if (remainingPlan.length !== plan.length) await PlannerData.savePlan(actor, remainingPlan);

    const consumed = PlannerData.getConsumed(actor);
    const remainingConsumed = consumed.filter((e) => !(e.type === type && e.key === key));
    if (remainingConsumed.length !== consumed.length) await PlannerData.saveConsumed(actor, remainingConsumed);
  }

  /**
   * When a sheet is first opened: discards every queue whose first step no longer starts from the
   * current value - e.g. after the "Advances" field was edited, which no wrap sees. Not on every
   * render, that would race against reconcile()'s own updates.
   * @param {Actor} actor
   * @returns {Promise<void>}
   */
  static async validateQueues(actor) {
    for (const group of PlannerData.getGroups(actor).values()) {
      if (!group.steps.length) continue;
      if (this.rawCurrentValue(actor, group.type, group.key) !== group.steps[0].from) {
        await this.discardQueue(actor, group.type, group.key);
      }
    }
  }

  /**
   * Applies the target's first step through the system's own advance or refund method, like a
   * normal click. reconcile() then runs through the wraps in sheet/integration.js.
   * @param {ActorSheet} sheet
   * @param {string} type
   * @param {string} key
   * @returns {Promise<boolean>} Whether the system applied it.
   */
  static async applyFirst(sheet, type, key) {
    const actor = sheet.actor;
    if (!actor.isOwner) return false;
    if (PlannerPhase.locked) {
      PlannerPhase.warn();
      return false;
    }
    await this.ensureFresh(actor, type, key);

    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx === -1) return false;

    // The system's _advanceItem would crash on a deleted item, e.g. if the cleanup hook hasn't run
    // yet.
    if (type === 'item' && !actor.items.get(key)) {
      await this.purgeTarget(actor, type, key);
      sheet.render();
      return false;
    }

    const isIncrease = plan[idx].to > plan[idx].from;

    let result;
    if (type === 'attribute') result = await (isIncrease ? sheet._advanceAttribute(key) : sheet._refundAttributeAdvance(key));
    else if (type === 'point') result = await (isIncrease ? sheet._advancePoints(key) : sheet._refundPointsAdvance(key));
    else if (type === 'item') result = await (isIncrease ? sheet._advanceItem(key) : sheet._refundItemAdvance(key));
    else if (type === 'permanentLoss') result = await (isIncrease ? sheet._rebuyPC(key) : sheet._refundPC(key));

    sheet.render();
    return !!result;
  }

  /**
   * Applies the target's first `count` steps one after the other and stops at the first that fails -
   * the system's checkEnoughXP has already shown why.
   * @param {ActorSheet} sheet
   * @param {string} type
   * @param {string} key
   * @param {number} count
   * @returns {Promise<void>}
   */
  static async applyUpTo(sheet, type, key, count) {
    for (let i = 0; i < count; i++) {
      const success = await this.applyFirst(sheet, type, key);
      if (!success) break;
    }
  }
}
