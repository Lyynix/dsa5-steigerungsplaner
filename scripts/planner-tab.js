import { PART_ID } from './module-config.js';
import PlannerData from './planner-data.js';
import PlannerController from './planner-controller.js';

export default class PlannerTab {
  static get partId() {
    return PART_ID;
  }

  static async prepareContext(sheet, context) {
    const actor = sheet.actor;
    const plan = PlannerData.getPlan(actor);

    const groups = new Map();
    for (const entry of plan) {
      const groupKey = `${entry.type}:${entry.key}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { type: entry.type, key: entry.key, label: entry.label, steps: [], totalCost: 0 });
      }
      const group = groups.get(groupKey);
      group.steps.push(entry);
      group.totalCost += entry.cost;
    }

    context.plannerGroups = Array.from(groups.values());
    context.plannerTotalCost = context.plannerGroups.reduce((sum, g) => sum + g.totalCost, 0);
    context.plannerAvailableXP = Number(actor.system.details.experience.total) - Number(actor.system.details.experience.spent);
    return context;
  }

  // sheet.hbs (the root part template) hardcodes a <template data-application-part="X">
  // placeholder for every part it knows about - ours isn't one of them, so Foundry's fallback
  // appends our rendered element to the end of the whole sheet instead of into the actual
  // tab-content container. Move it next to the "notes" part, which is guaranteed to exist and
  // sits in that same container. Safe to call on every render: if already in place, this is a
  // no-op (inserting a node immediately after its own current position doesn't move anything).
  static relocate(sheet, element) {
    const notes = sheet.element.querySelector('[data-application-part="notes"]');
    if (!notes?.parentElement) return;
    notes.parentElement.insertBefore(element, notes.nextSibling);
  }

  static attachListeners(sheet, element) {
    this.relocate(sheet, element);

    element.querySelectorAll('[data-plan-apply]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const { type, key } = ev.currentTarget.dataset;
        PlannerController.applyFirst(sheet, type, key);
      });
    });

    element.querySelectorAll('[data-plan-cancel]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        const { type, key } = ev.currentTarget.dataset;
        await PlannerController.cancelLast(sheet.actor, type, key);
        sheet.render();
      });
    });
  }
}
