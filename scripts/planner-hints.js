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
      //
      // The pAsP/pKaP rebuy buttons (_rebuyPC/_refundPC) never go through _onHoverCost at all - its
      // fct map doesn't cover them, so their data-tooltip is whatever the template baked in
      // ("rebuyCost"/"rebuyRevertCost", a raw localization *key*, not yet the localized text -
      // Foundry's tooltip manager auto-localizes matching keys when it renders the tooltip, without
      // ever writing the localized string back into the attribute). Running it through localize()
      // ourselves normalizes both cases: it's a no-op for the already-localized cost text the other
      // buttons carry, but turns "rebuyCost" into "Zurückkaufen für 2 AP" here - without this, ours
      // would append onto the raw key, and the key would no longer match anything to auto-localize.
      //
      // Those same two buttons also nest their icon in a child <i data-tooltip="..."> instead of
      // carrying data-tooltip on the data-fct element itself (unlike every other advance/refund
      // button, where _onHoverCost writes straight onto the element the listener is bound to).
      // Resolving the actual tooltip-bearing element here - falling back to `el` itself when there
      // is no such child - means we read from and write to wherever the text really lives either way.
      el.addEventListener('mouseenter', () => {
        if (el.dataset.plannerHintAdded) return;
        el.dataset.plannerHintAdded = '1';

        const tooltipEl = el.querySelector('[data-tooltip]') ?? el;
        const cost = game.i18n.localize(tooltipEl.dataset.tooltip ?? '');
        tooltipEl.dataset.tooltip = `${cost}<br><br>${game.i18n.localize('STEIGERUNGSPLANER.ShiftClickHint')}`;
        game.tooltip.activate(tooltipEl);
      });
    }
  }
}
