import { ADVANCE_FCTS, REFUND_FCTS } from './module-config.js';
import PlannerData from './planner-data.js';

export default class PlannerController {
  // Entry point for a shift-click on any of the sheet's advance/refund "+"/"-" buttons.
  //
  // Queues can now hold both increase and decrease steps (planning "unlevel this, level that"
  // respec-style moves), so +/- are symmetric: clicking a direction cancels the last queued step
  // if it happens to be the *opposite* direction (undoing what the previous click just queued),
  // otherwise it queues one more step in the clicked direction.
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

    const plan = PlannerData.getPlan(actor);
    const lastIdx = PlannerData.lastIndex(plan, type, key);
    const last = lastIdx === -1 ? null : plan[lastIdx];
    const lastDirection = last ? (last.to > last.from ? 'increase' : 'decrease') : null;

    if (last && lastDirection !== direction) {
      await this.cancelLast(actor, type, key);
    } else {
      await this.planStep(actor, type, key, direction);
    }

    sheet.render();
  }

  // The target's actual current value, independent of anything queued in the plan.
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
    return null;
  }

  static categoryFor(actor, type, key) {
    const isAnimal = actor.system.isPet || actor.system.isFamiliar;
    if (type === 'attribute') return isAnimal ? 'C' : 'E';
    if (type === 'point') return isAnimal ? 'C' : 'D';
    if (type === 'item') return actor.items.get(key)?.system.advanceCategory ?? null;
    return null;
  }

  static labelFor(actor, type, key) {
    if (type === 'attribute') return game.i18n.localize(`CHAR.${key.toUpperCase()}`);
    if (type === 'point') return game.i18n.localize(key);
    if (type === 'item') return actor.items.get(key)?.name ?? key;
    return key;
  }

  // The tab's display grouping (Körpertalente, Kampftechniken, Eigenschaften, ...) - distinct
  // from categoryFor()'s A-E advancement-cost category. For skill items this mirrors the exact
  // grouping DSA5's own talent list uses (item.system.group.value), `cssClass` reuses the
  // system's own .skills.<group> gradient classes so the colors match what's already on the
  // talent tab. Sections without a system equivalent (characteristics, points, combat, magic,
  // religion) get their own gradient defined in our own stylesheet.
  static sectionFor(actor, type, key) {
    if (type === 'attribute') {
      return { id: 'characteristics', label: game.i18n.localize('STEIGERUNGSPLANER.Section.characteristics'), cssClass: 'steigerungsplaner-section-characteristics' };
    }
    if (type === 'point') {
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

  // Per-target icon shown next to its entry in the planner tab. Items already carry their own
  // icon; characteristics get the matching d20 die; the three advanceable base stats don't have
  // a system icon for this context, so they're hand-picked.
  static iconFor(actor, type, key) {
    if (type === 'attribute') return `systems/dsa5/icons/dice/d20${key}.svg`;
    if (type === 'point') {
      return {
        wounds: 'systems/dsa5/icons/talents/HeilkundeWunden.webp',
        astralenergy: 'systems/dsa5/icons/categories/ability_magical.webp',
        karmaenergy: 'systems/dsa5/icons/categories/ability_clerical.webp',
      }[key] ?? null;
    }
    if (type === 'item') return actor.items.get(key)?.img ?? null;
    return null;
  }

  // Where this target's queue currently "ends" - the value the next queued step (in either
  // direction) would start from. That's either the last queued entry's `to`, or, if nothing is
  // queued yet, the actual current value.
  static chainEnd(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.lastIndex(plan, type, key);
    return idx === -1 ? this.rawCurrentValue(actor, type, key) : plan[idx].to;
  }

  // The lowest value a real refund is allowed to bring this target down to - mirrors the guards
  // the system's own _refundAttributeAdvance/_refundPointsAdvance (`advances > 0`) and
  // AdvancableSkill._refundStep (`value > advanceMin`) already enforce, expressed in the same
  // terms rawCurrentValue/chainEnd use (the full displayed value, not just the raw advances count).
  static minValue(actor, type, key) {
    if (type === 'attribute') return actor.system.characteristics[key]?.initial ?? 0;
    if (type === 'point') return 0;
    if (type === 'item') return actor.items.get(key)?.system.advanceMin || 0;
    return 0;
  }

  // Mirrors the cost calculation the system itself uses (DSA5_Utility._calculateAdvCost),
  // continuing from wherever this target's queue currently ends rather than its actual live value.
  static buildEntry(actor, type, key, direction) {
    const category = this.categoryFor(actor, type, key);
    if (!category) return null;

    const from = this.chainEnd(actor, type, key);
    if (from === null) return null;

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

  // If this target already has a queue whose oldest entry no longer starts from the actual
  // current value (e.g. someone typed directly into the "Advances" field), it can't be trusted -
  // discard it before acting. Checked at the top of every click-driven entry point rather than on
  // a render sweep, so drift is caught the next time this target is touched instead of only when
  // the sheet is reopened.
  static async ensureFresh(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx !== -1 && this.rawCurrentValue(actor, type, key) !== plan[idx].from) {
      await this.discardQueue(actor, type, key);
    }
  }

  static async planStep(actor, type, key, direction) {
    const entry = this.buildEntry(actor, type, key, direction);
    if (!entry) {
      if (direction === 'decrease') {
        ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.CannotDecreaseFurther', { label: this.labelFor(actor, type, key) }));
      }
      return;
    }
    const plan = PlannerData.getPlan(actor);
    plan.push(entry);
    await PlannerData.savePlan(actor, plan);
  }

  static async cancelLast(actor, type, key) {
    if (!actor.isOwner) return;
    await this.ensureFresh(actor, type, key);

    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.lastIndex(plan, type, key);
    if (idx === -1) {
      ui.notifications.warn(game.i18n.localize('STEIGERUNGSPLANER.NothingPlanned'));
      return;
    }
    plan.splice(idx, 1);
    await PlannerData.savePlan(actor, plan);
  }

  // Called whenever a real advance OR refund succeeded for real, whether triggered from here or
  // from a normal, un-shifted sheet click (see the six ADVANCE_FCTS/REFUND_FCTS method wraps in
  // sheet-integration.js). `valueAfterChange` is the target's actual value right after that
  // real change. Three possibilities, checked in order:
  //
  //   1. The front of the queue (oldest, next thing due) expected exactly this transition
  //      (`front.to === valueAfterChange`) - consume it: pop it off the plan and push it onto a
  //      per-target LIFO "consumed" stack, regardless of whether it was an increase or decrease.
  //   2. Nothing in the queue matched, but the most recently consumed step for this target
  //      started at exactly this value (`top.from === valueAfterChange`) - the player just undid
  //      that step for real (a real refund undoing a consumed increase, or a real advance undoing
  //      a consumed decrease). Put it back at the front of the plan.
  //   3. Neither matches - whatever's still queued assumes a baseline that no longer holds (e.g.
  //      de-leveling directly via "-" without ever having applied anything from the plan first -
  //      DSA5 lets you do this even though it's not "legal" by the rules). Discard it rather than
  //      silently tracking increasingly wrong from/to numbers.
  static async reconcile(actor, type, key, valueAfterChange) {
    const plan = PlannerData.getPlan(actor);
    const frontIdx = PlannerData.firstIndex(plan, type, key);
    const front = frontIdx === -1 ? null : plan[frontIdx];

    if (front && front.to === valueAfterChange) {
      plan.splice(frontIdx, 1);
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

      const insertAt = PlannerData.firstIndex(plan, type, key);
      if (insertAt === -1) plan.push(top);
      else plan.splice(insertAt, 0, top);
      await PlannerData.savePlan(actor, plan);
      return;
    }

    await this.discardQueue(actor, type, key);
  }

  static async discardQueue(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const remaining = plan.filter((e) => !(e.type === type && e.key === key));
    if (remaining.length === plan.length) return;

    await PlannerData.savePlan(actor, remaining);
    ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.PlanDiscarded', { label: this.labelFor(actor, type, key) }));
  }

  // Removes every plan/consumed entry for a target, no questions asked - for when the target
  // itself is gone (deleted item) rather than merely out of sync. No notification: the player
  // just deleted the thing themselves, so losing its plan isn't surprising.
  static async purgeTarget(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const remainingPlan = plan.filter((e) => !(e.type === type && e.key === key));
    if (remainingPlan.length !== plan.length) await PlannerData.savePlan(actor, remainingPlan);

    const consumed = PlannerData.getConsumed(actor);
    const remainingConsumed = consumed.filter((e) => !(e.type === type && e.key === key));
    if (remainingConsumed.length !== consumed.length) await PlannerData.saveConsumed(actor, remainingConsumed);
  }

  // Safety net for desyncs none of the targeted advance/refund checks catch - most notably
  // editing the "Advances" number field directly, which bypasses every wrapped method entirely.
  // Called once when a sheet is first opened (see the _onFirstRender wrap): if a target's oldest
  // queued step no longer starts from its actual current value, the queue can't be trusted -
  // discard it. Deliberately not run on every render: it would race against our own multi-step
  // reconcile() updates, which each trigger their own re-render before the plan flag has caught
  // up with the real advance/refund that just happened.
  static async validateQueues(actor) {
    for (const group of PlannerData.getGroups(actor).values()) {
      if (!group.steps.length) continue;
      if (this.rawCurrentValue(actor, group.type, group.key) !== group.steps[0].from) {
        await this.discardQueue(actor, group.type, group.key);
      }
    }
  }

  // Applies the oldest (front) queued step for a target by invoking the matching real system
  // method - the real advance method if the front step is an increase, the real refund method if
  // it's a decrease (identical to a normal, un-shifted click either way) - reconcile() runs as a
  // side effect of that call via the wraps in sheet-integration.js, so no separate bookkeeping is
  // needed here.
  static async applyFirst(sheet, type, key) {
    const actor = sheet.actor;
    if (!actor.isOwner) return;
    await this.ensureFresh(actor, type, key);

    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx === -1) return;

    // Guards against a crash in the system's own _advanceItem/_refundItemAdvance if the item was
    // deleted but its plan entry survived somehow (e.g. the deleteItem cleanup hook hasn't run yet).
    if (type === 'item' && !actor.items.get(key)) {
      await this.purgeTarget(actor, type, key);
      sheet.render();
      return;
    }

    const isIncrease = plan[idx].to > plan[idx].from;

    if (type === 'attribute') await (isIncrease ? sheet._advanceAttribute(key) : sheet._refundAttributeAdvance(key));
    else if (type === 'point') await (isIncrease ? sheet._advancePoints(key) : sheet._refundPointsAdvance(key));
    else if (type === 'item') await (isIncrease ? sheet._advanceItem(key) : sheet._refundItemAdvance(key));

    sheet.render();
  }
}
