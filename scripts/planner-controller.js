import { ADVANCE_FCTS, REFUND_FCTS } from './module-config.js';
import PlannerData from './planner-data.js';

export default class PlannerController {
  // Entry point for a shift-click on any of the sheet's advance/refund "+"/"-" buttons.
  static async handleShiftClick(sheet, fct, key) {
    const actor = sheet.actor;

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
  // The removed entry is pushed onto a per-target LIFO "consumed" stack rather than discarded,
  // so a matching real refund can restore it (see restoreIfMatching).
  static async consumeOldest(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx === -1) return;

    const [entry] = plan.splice(idx, 1);
    await PlannerData.savePlan(actor, plan);

    const consumed = PlannerData.getConsumed(actor);
    consumed.push(entry);
    await PlannerData.saveConsumed(actor, consumed);
  }

  // Called whenever a real refund succeeded (via the _refundAttributeAdvance/_refundPointsAdvance/
  // _refundItemAdvance wraps). `valueAfterRefund` is the target's actual value right after that
  // refund. If the top of this target's "consumed" stack is exactly the step that refund just
  // undid (i.e. it advanced the value from valueAfterRefund to valueAfterRefund + 1), put it back
  // at the front of the plan. Otherwise leave the plan alone - better to do nothing than guess
  // wrong (e.g. the refunded step was never plan-sourced in the first place).
  static async restoreIfMatching(actor, type, key, valueAfterRefund) {
    const consumed = PlannerData.getConsumed(actor);
    const idx = PlannerData.lastIndex(consumed, type, key);
    if (idx === -1) return;

    const entry = consumed[idx];
    if (entry.to !== valueAfterRefund + 1) return;

    consumed.splice(idx, 1);
    await PlannerData.saveConsumed(actor, consumed);

    const plan = PlannerData.getPlan(actor);
    const insertAt = PlannerData.firstIndex(plan, type, key);
    if (insertAt === -1) plan.push(entry);
    else plan.splice(insertAt, 0, entry);
    await PlannerData.savePlan(actor, plan);
  }

  // Applies the oldest queued step for a target by invoking the real system advance method
  // (identical to a normal, un-shifted click) - consumeOldest() runs as a side effect of that
  // call via the wraps in sheet-integration.js, so no separate bookkeeping is needed here.
  static async applyFirst(sheet, type, key) {
    const actor = sheet.actor;
    const plan = PlannerData.getPlan(actor);
    if (PlannerData.firstIndex(plan, type, key) === -1) return;

    if (type === 'attribute') await sheet._advanceAttribute(key);
    else if (type === 'point') await sheet._advancePoints(key);
    else if (type === 'item') await sheet._advanceItem(key);

    sheet.render();
  }
}
