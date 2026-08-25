import { ADVANCE_FCTS } from './module-config.js';
import PlannerData from './planner-data.js';

const BADGE_CLASS = 'steigerungsplaner-badge';
const DECREASE_CLASS = 'steigerungsplaner-badge-decrease';

// Decorates the "+" button for each target that has queued plan steps with a small count badge
// (e.g. "+2" or "-1"). A target's queue is always homogeneous - the same direction throughout,
// since clicking the opposite of the last queued step cancels it rather than appending (see
// PlannerController.handleShiftClick) - so a single badge with a sign is enough; no need to
// decorate "-" separately. Generic across characteristics, points and items since they all share
// the same data-action="advanceWrapper"/data-fct/data-attr convention - no per-template changes needed.
export default class PlannerBadges {
  static decorate(sheet) {
    sheet.element.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());

    const groups = PlannerData.getGroups(sheet.actor);
    if (!groups.size) return;

    for (const el of sheet.element.querySelectorAll('[data-fct]')) {
      const type = ADVANCE_FCTS[el.dataset.fct];
      if (!type) continue; // only decorate the "+" button

      const group = groups.get(`${type}:${el.dataset.attr}`);
      if (!group) continue;

      const isIncrease = group.steps[0].to > group.steps[0].from;

      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.classList.toggle(DECREASE_CLASS, !isIncrease);
      badge.textContent = `${isIncrease ? '+' : '-'}${group.steps.length}`;
      badge.dataset.tooltip = game.i18n.localize("STEIGERUNGSPLANER.Planned") + '<br>' + group.steps.map((s) => `${s.from} » ${s.to}: ${s.cost} AP`).join('<br>');

      if (type === 'attribute') {
        // The characteristics header row is too narrow for inline badge text next to "+" - float
        // it above the icon instead, in headroom .char-row-header .header-label now reserves for it.
        badge.classList.add('steigerungsplaner-badge-above');
        el.style.position = 'relative';
        el.appendChild(badge);
      } else {
        el.insertAdjacentElement('beforebegin', badge);
      }
    }
  }
}
