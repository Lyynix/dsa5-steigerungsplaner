import { PART_ID } from './module-config.js';
import PlannerData from './planner-data.js';
import PlannerController from './planner-controller.js';
import { applyingIds } from './planner-state.js';

export default class PlannerTab {
  static get partId() {
    return PART_ID;
  }

  // Groups target-groups (one per attribute/point/item, from PlannerData.getGroups) a second
  // time by display section (Körpertalente, Kampftechniken, Eigenschaften, ...) for the tab's
  // layout. Sections appear in the order their first member was first encountered.
  static buildSections(actor) {
    const sections = new Map();

    for (const group of PlannerData.getGroups(actor).values()) {
      group.icon = PlannerController.iconFor(actor, group.type, group.key);

      const section = PlannerController.sectionFor(actor, group.type, group.key);
      if (!sections.has(section.id)) sections.set(section.id, { ...section, groups: [], totalCost: 0 });

      const s = sections.get(section.id);
      s.groups.push(group);
      s.totalCost += group.totalCost;
    }

    return Array.from(sections.values());
  }

  static async prepareContext(sheet, context) {
    const actor = sheet.actor;

    context.plannerSections = this.buildSections(actor);
    context.plannerTotalCost = context.plannerSections.reduce((sum, s) => sum + s.totalCost, 0);
    context.plannerAvailableXP = PlannerController.availableXP(actor);
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
        const firstStepEl = ev.currentTarget.parentElement.querySelector('.planner-steps .planner-step:first-child');

        if (!firstStepEl) return;

        const { type, key } = ev.currentTarget.dataset;
        const plan = PlannerData.getPlan(sheet.actor);
        const idx = PlannerData.firstIndex(plan, type, key);
        const entry = idx === -1 ? null : plan[idx];
        if (!entry) return;

        if (entry.cost > 0 && PlannerController.availableXP(sheet.actor) < entry.cost) {
          ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.NotEnoughXP', { label: entry.label }));
          return;
        }

        element.style.pointerEvents = 'none';

        firstStepEl.addEventListener('transitionend', () => {
          applyingIds.add(entry.id);
          PlannerController.applyFirst(sheet, type, key).finally(() => {
            applyingIds.delete(entry.id);
          });
        }, { once: true });

        firstStepEl.classList.add('planner-step-applying');
      });
    });

    element.querySelectorAll('[data-plan-cancel]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const lastStepEl = ev.currentTarget.parentElement.querySelector('.planner-steps .planner-step:last-child');

        if (!lastStepEl) return;

        const { type, key } = ev.currentTarget.dataset;

        element.style.pointerEvents = 'none';

        lastStepEl.addEventListener('transitionend', () => {
          PlannerController.cancelLast(sheet.actor, type, key).then(() => sheet.render());
        }, { once: true });

        lastStepEl.classList.add('planner-step-cancelling');
      });
    });
  }
}
