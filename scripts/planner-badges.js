import { ALL_FCTS } from './module-config.js';
import PlannerData from './planner-data.js';

const BADGE_CLASS = 'steigerungsplaner-badge';

// Decorates every advance/refund button on the sheet whose target has queued plan steps with a
// small count badge (e.g. "3"), tooltip showing the concrete steps. Shown next to both the "+"
// and the "-" button for that target - since queues can hold increases and decreases alike, a
// badge on just one side would be misleading about what's actually queued. Generic across
// characteristics, points and items since they all share the same
// data-action="advanceWrapper"/data-fct/data-attr convention - no per-template changes needed.
export default class PlannerBadges {
  static decorate(sheet) {
    sheet.element.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());

    const groups = PlannerData.getGroups(sheet.actor);
    if (!groups.size) return;

    for (const el of sheet.element.querySelectorAll('[data-fct]')) {
      const type = ALL_FCTS[el.dataset.fct];
      if (!type) continue;

      const group = groups.get(`${type}:${el.dataset.attr}`);
      if (!group) continue;

      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.textContent = `${group.steps.length}`;
      badge.dataset.tooltip = game.i18n.localize("STEIGERUNGSPLANER.Planned") + '<br>' + group.steps.map((s) => `${s.from} » ${s.to}: ${s.cost} AP`).join('<br>');
      el.insertAdjacentElement('beforebegin', badge);
    }
  }
}
