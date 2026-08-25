export const MODULE_ID = 'dsa5-steigerungsplaner';
export const FLAG_PLAN = 'plan';
// LIFO stack per target of plan entries that were consumed by a real advance - lets a matching
// real refund restore the exact step it just undid instead of leaving the plan stale.
export const FLAG_CONSUMED = 'consumed';
export const PART_ID = 'steigerungsplaner';

// data-fct values used by the DSA5 "advanceWrapper" action, mapped to our internal target type
export const ADVANCE_FCTS = {
  _advanceAttribute: 'attribute',
  _advancePoints: 'point',
  _advanceItem: 'item',
};

export const REFUND_FCTS = {
  _refundAttributeAdvance: 'attribute',
  _refundPointsAdvance: 'point',
  _refundItemAdvance: 'item',
};
