/**
 * @file The "Shift-click: add to the planner" line under the system's cost tooltip on every "+"/"-"
 * button of the sheet - on every one, not only planned targets, since that's how players find out
 * shift-click exists at all.
 */

import { ALL_FCTS } from '../config.js';

/** The hints. */
export default class PlannerHints {
  /**
   * Adds the hint to the sheet's buttons. Called after every render.
   * @param {ActorSheet} sheet
   */
  static decorate(sheet) {
    for (const el of sheet.element.querySelectorAll('[data-fct]')) {
      if (!ALL_FCTS[el.dataset.fct]) continue; // only our six targets - pAsP/pKaP aren't plannable yet
      if (el.dataset.plannerHinted) continue; // listener already attached this render

      el.dataset.plannerHinted = '1';

      // Added on the first hover, after the system's own _onHoverCost has written the cost. That one
      // skips if a tooltip is already set - setting ours up front would replace the cost for good.
      //
      // The rebuy buttons (pAsP/pKaP) don't go through _onHoverCost: their tooltip is the raw
      // localization key from the template, which Foundry only localizes when showing it. Localized
      // here, otherwise ours would be appended to the key. A no-op for the others' text.
      //
      // Those two also carry the tooltip on a child <i>, not on the button itself - so it's read from
      // and written to wherever it is.
      el.addEventListener('mouseenter', () => {
        if (el.dataset.plannerHintAdded) return;
        el.dataset.plannerHintAdded = '1';

        const tooltipEl = el.querySelector('[data-tooltip]') ?? el;
        const cost = game.i18n.localize(tooltipEl.dataset.tooltip ?? '');
        tooltipEl.dataset.tooltip = `${cost}<br><br>${game.i18n.localize('STEIGERUNGSPLANER.Plan.ShiftClickHint')}`;
        game.tooltip.activate(tooltipEl);
      });
    }
  }
}
