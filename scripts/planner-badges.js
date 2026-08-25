import { ADVANCE_FCTS } from './module-config.js';
import PlannerData from './planner-data.js';

const BADGE_CLASS = 'steigerungsplaner-badge';

// Decorates every "+" advance button on the sheet that has queued plan steps with a small
// count badge (e.g. "+2"), tooltip showing the concrete steps. Generic across characteristics,
// points and items since they all share the same data-action="advanceWrapper"/data-fct/data-attr
// convention - no per-template changes needed.
export default class PlannerBadges {
  static decorate(sheet) {
    sheet.element.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());

    const groups = PlannerData.getGroups(sheet.actor);
    if (!groups.size) return;

    for (const el of sheet.element.querySelectorAll('[data-fct]')) {
      const type = ADVANCE_FCTS[el.dataset.fct];
      if (!type) continue; // only decorate the "+" buttons, not "-"

      const group = groups.get(`${type}:${el.dataset.attr}`);
      if (!group) continue;

      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.textContent = `+${group.steps.length}`;
      badge.dataset.tooltip = group.steps.map((s) => `${s.from} » ${s.to}: ${s.cost} AP`).join('<br>');
      // Placed before the "+" button (not after) so its position stays stable when a badge
      // appears/disappears - the adjacent input field is what shrinks/grows instead.
      el.insertAdjacentElement('beforebegin', badge);
    }
  }
}
