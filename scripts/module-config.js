export const MODULE_ID = 'dsa5-steigerungsplaner';
export const FLAG_PLAN = 'plan';
// LIFO stack per target of plan entries that were consumed by a real advance - lets a matching
// real refund restore the exact step it just undid instead of leaving the plan stale.
export const FLAG_CONSUMED = 'consumed';
// Items that need GM approval instead of being bought step by step - see RequestController.
export const FLAG_REQUESTS = 'requests';
export const PART_ID = 'steigerungsplaner';
// World setting: typing a value into the sheet's input fields plans the steps instead of setting it.
export const SETTING_INPUT_PLANS = 'inputPlans';

// data-fct values used by the DSA5 "advanceWrapper" action, mapped to our internal target type
export const ADVANCE_FCTS = {
  _advanceAttribute: 'attribute',
  _advancePoints: 'point',
  _advanceItem: 'item',
  _rebuyPC: 'permanentLoss',
};

export const REFUND_FCTS = {
  _refundAttributeAdvance: 'attribute',
  _refundPointsAdvance: 'point',
  _refundItemAdvance: 'item',
  _refundPC: 'permanentLoss',
};

// Combined lookup for places that don't care whether a button is the "+" or "-" one, just which
// target it belongs to (e.g. badge decoration, since queues can now contain both directions).
export const ALL_FCTS = { ...ADVANCE_FCTS, ...REFUND_FCTS };
