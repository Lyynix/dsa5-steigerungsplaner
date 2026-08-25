import { ADVANCE_FCTS, REFUND_FCTS } from './module-config.js';
import PlannerData from './planner-data.js';

export default class PlannerController {
  // Entry point for a shift-click on any of the sheet's advance/refund "+"/"-" buttons.
  static async handleShiftClick(sheet, fct, key) {
    const actor = sheet.actor;
    if (!actor.isOwner) return;

    if (fct in ADVANCE_FCTS) {
      await this.planAdvance(actor, ADVANCE_FCTS[fct], key);
    } else if (fct in REFUND_FCTS) {
      await this.cancelLast(actor, REFUND_FCTS[fct], key);
    } else {
      return;
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

  // Mirrors the cost calculation the system itself uses (DSA5_Utility._calculateAdvCost),
  // but offset by however many steps for this target are already queued.
  static buildEntry(actor, type, key) {
    const base = this.rawCurrentValue(actor, type, key);
    if (base === null) return null;

    const category = this.categoryFor(actor, type, key);
    if (!category) return null;

    const already = PlannerData.queuedCount(actor, type, key);
    const from = base + already;
    const cost = game.dsa5.apps.DSA5_Utility._calculateAdvCost(from, category);

    return { id: foundry.utils.randomID(), type, key, label: this.labelFor(actor, type, key), from, to: from + 1, cost, category };
  }

  static async planAdvance(actor, type, key) {
    const entry = this.buildEntry(actor, type, key);
    if (!entry) return;
    const plan = PlannerData.getPlan(actor);
    plan.push(entry);
    await PlannerData.savePlan(actor, plan);
  }

  static async cancelLast(actor, type, key) {
    if (!actor.isOwner) return;

    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.lastIndex(plan, type, key);
    if (idx === -1) {
      ui.notifications.warn(game.i18n.localize('STEIGERUNGSPLANER.NothingPlanned'));
      return;
    }
    plan.splice(idx, 1);
    await PlannerData.savePlan(actor, plan);
  }

  // Removes the oldest queued step for a target - called whenever that step was actually
  // executed for real, whether triggered from here or from a normal, un-shifted sheet click
  // (see the _advanceAttribute/_advancePoints/_advanceItem wraps in sheet-integration.js).
  // `valueAfterAdvance` is the target's actual value right after that advance; only pop the
  // oldest entry if it's actually the one that produced this transition (its `to` matches) -
  // otherwise the queue's baseline is already wrong for other reasons, so discard it rather than
  // remove a step that has nothing to do with what just happened for real.
  // The removed entry is pushed onto a per-target LIFO "consumed" stack rather than discarded,
  // so a matching real refund can restore it (see restoreIfMatching).
  static async consumeOldest(actor, type, key, valueAfterAdvance) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx === -1) return;

    const entry = plan[idx];
    if (entry.to !== valueAfterAdvance) {
      await this.discardQueue(actor, type, key);
      return;
    }

    plan.splice(idx, 1);
    await PlannerData.savePlan(actor, plan);

    const consumed = PlannerData.getConsumed(actor);
    consumed.push(entry);
    await PlannerData.saveConsumed(actor, consumed);
  }

  // Called whenever a real refund succeeded (via the _refundAttributeAdvance/_refundPointsAdvance/
  // _refundItemAdvance wraps). `valueAfterRefund` is the target's actual value right after that
  // refund. If the top of this target's "consumed" stack is exactly the step that refund just
  // undid (i.e. it advanced the value from valueAfterRefund to valueAfterRefund + 1), put it back
  // at the front of the plan.
  static async restoreIfMatching(actor, type, key, valueAfterRefund) {
    const consumed = PlannerData.getConsumed(actor);
    const idx = PlannerData.lastIndex(consumed, type, key);
    const entry = idx === -1 ? null : consumed[idx];

    if (entry && entry.to === valueAfterRefund + 1) {
      consumed.splice(idx, 1);
      await PlannerData.saveConsumed(actor, consumed);

      const plan = PlannerData.getPlan(actor);
      const insertAt = PlannerData.firstIndex(plan, type, key);
      if (insertAt === -1) plan.push(entry);
      else plan.splice(insertAt, 0, entry);
      await PlannerData.savePlan(actor, plan);
      return;
    }

    // Not undoing a plan-sourced step (e.g. de-leveling directly via "-" without ever having
    // applied anything from the plan first - DSA5 lets you do this even though it's not "legal"
    // by the rules). Whatever is still queued for this target now assumes the wrong baseline, so
    // discard it rather than silently track increasingly wrong from/to numbers.
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
  // consumeOldest/restoreIfMatching updates, which each trigger their own re-render before the
  // plan flag has caught up with the real advance/refund that just happened.
  static async validateQueues(actor) {
    for (const group of PlannerData.getGroups(actor).values()) {
      if (!group.steps.length) continue;
      if (this.rawCurrentValue(actor, group.type, group.key) !== group.steps[0].from) {
        await this.discardQueue(actor, group.type, group.key);
      }
    }
  }

  // Applies the oldest queued step for a target by invoking the real system advance method
  // (identical to a normal, un-shifted click) - consumeOldest() runs as a side effect of that
  // call via the wraps in sheet-integration.js, so no separate bookkeeping is needed here.
  static async applyFirst(sheet, type, key) {
    const actor = sheet.actor;
    if (!actor.isOwner) return;

    const plan = PlannerData.getPlan(actor);
    if (PlannerData.firstIndex(plan, type, key) === -1) return;

    // Guards against a crash in the system's own _advanceItem if the item was deleted but its
    // plan entry survived somehow (e.g. the deleteItem cleanup hook hasn't run yet).
    if (type === 'item' && !actor.items.get(key)) {
      await this.purgeTarget(actor, type, key);
      sheet.render();
      return;
    }

    if (type === 'attribute') await sheet._advanceAttribute(key);
    else if (type === 'point') await sheet._advancePoints(key);
    else if (type === 'item') await sheet._advanceItem(key);

    sheet.render();
  }
}
