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

  // Mirrors the cost calculation the system itself uses (DSA5_Utility._calculateAdvCost),
  // but offset by however many steps for this target are already queued.
  static buildEntry(actor, type, key) {
    const DSA5_Utility = game.dsa5.apps.DSA5_Utility;
    const already = PlannerData.queuedCount(actor, type, key);
    const isAnimal = actor.system.isPet || actor.system.isFamiliar;

    if (type === 'attribute') {
      const ch = actor.system.characteristics[key];
      if (!ch) return null;
      const from = ch.initial + ch.advances + already;
      const category = isAnimal ? 'C' : 'E';
      const cost = DSA5_Utility._calculateAdvCost(from, category);
      return { id: foundry.utils.randomID(), type, key, label: game.i18n.localize(`CHAR.${key.toUpperCase()}`), from, to: from + 1, cost, category };
    }

    if (type === 'point') {
      const status = actor.system.status[key];
      if (!status) return null;
      const from = status.advances + already;
      const category = isAnimal ? 'C' : 'D';
      const cost = DSA5_Utility._calculateAdvCost(from, category);
      return { id: foundry.utils.randomID(), type, key, label: game.i18n.localize(key), from, to: from + 1, cost, category };
    }

    if (type === 'item') {
      const item = actor.items.get(key);
      if (!item) return null;
      const from = item.system.talentValue.value + already;
      const category = item.system.advanceCategory;
      const cost = DSA5_Utility._calculateAdvCost(from, category);
      return { id: foundry.utils.randomID(), type, key, label: item.name, from, to: from + 1, cost, category };
    }

    return null;
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
  static async consumeOldest(actor, type, key) {
    const plan = PlannerData.getPlan(actor);
    const idx = PlannerData.firstIndex(plan, type, key);
    if (idx === -1) return;
    plan.splice(idx, 1);
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
