/**
 * @file Count badges on the sheet's "+" buttons for targets with planned steps, e.g. "+2" or "-1",
 * with the steps in the tooltip. A queue only ever goes one direction (see
 * PlannerController.handleShiftClick), so one badge with a sign is enough. Works for attributes,
 * base stats and items alike - they all use the system's data-fct/data-attr buttons.
 */

import { ADVANCE_FCTS } from '../config.js';
import PlannerData from '../plan/data.js';
import PlannerLimits from '../plan/limits.js';

const BADGE_CLASS = 'steigerungsplaner-badge';
const DECREASE_CLASS = 'steigerungsplaner-badge-decrease';

/** The badges. */
export default class PlannerBadges {
  /**
   * Replaces the sheet's badges with ones for the current plan. Called after every render.
   * @param {ActorSheet} sheet
   */
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
      badge.dataset.tooltip = game.i18n.localize("STEIGERUNGSPLANER.Plan.Title") + '<br>' + group.steps.map((s) => `${s.from} » ${s.to}: ${s.cost} AP`).join('<br>');

      // A planned step above the rule maximum - the badge gets the hint's color and a line on it.
      const limit = PlannerLimits.mark(sheet.actor, type, el.dataset.attr, group.steps);
      if (limit) {
        badge.classList.add(`steigerungsplaner-badge-limit-${limit.limit}`);
        badge.dataset.tooltip += `<br><br>${limit.hint}`;
      }

      if (type === 'attribute' || type === 'point' || type === 'permanentLoss') {
        // The attribute and base stat rows have no room next to the "+" - the badge floats above
        // the icon, in the room .char-row-header .header-label keeps free for it.
        badge.classList.add('steigerungsplaner-badge-above');
        el.style.position = 'relative';
        el.appendChild(badge);
      } else {
        el.insertAdjacentElement('beforebegin', badge);
      }
    }
  }
}
