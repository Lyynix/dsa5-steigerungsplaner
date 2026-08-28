import { ALL_FCTS } from './module-config.js';

// Appends a short usage hint to the system's own cost tooltip on every advance/refund "+"/"-"
// button - not just the ones with something already queued (unlike PlannerBadges, which only
// decorates targets with an active plan; a first-time user needs this hint on every button, since
// that's how they'd discover Shift-click exists at all).
export default class PlannerHints {
  static decorate(sheet) {
    for (const el of sheet.element.querySelectorAll('[data-fct]')) {
      if (!ALL_FCTS[el.dataset.fct]) continue; // only our six targets - pAsP/pKaP aren't plannable yet
      if (el.dataset.plannerHinted) continue; // listener already attached this render

      el.dataset.plannerHinted = '1';

      // DSA5's own _onHoverCost (bound to the same mouseenter event, registered before this one in
      // the same _onRender wrap - see sheet-integration.js) computes the real AP-cost tooltip
      // lazily on first hover, guarded by "if dataset.tooltip is already set, skip". Setting our
      // hint proactively here instead of inside this handler would trip that guard permanently for
      // the rest of this render, silently replacing the AP cost with our hint instead of adding to
      // it. Appending only once the system's own text is already in place avoids that.
      el.addEventListener('mouseenter', () => {
        if (el.dataset.plannerHintAdded) return;
        el.dataset.plannerHintAdded = '1';
        el.dataset.tooltip = `${el.dataset.tooltip ?? ''}<br><br>${game.i18n.localize('STEIGERUNGSPLANER.ShiftClickHint')}`;
        game.tooltip.activate(el);
      });
    }
  }
}
