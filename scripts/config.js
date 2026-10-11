/**
 * @file Constants shared across the module: ids, flag and setting keys, and the sheet's advance and
 * refund functions mapped to our target types.
 */

/** The module's id, also the flag scope. */
export const MODULE_ID = 'dsa5-steigerungsplaner';

/** Actor flag with the plan: a flat, ordered array of steps, see PlannerData. */
export const FLAG_PLAN = 'plan';

/**
 * Actor flag with the plan steps a real advance used up, per target, last one first. A matching
 * real refund puts the exact step back instead of leaving the plan stale.
 */
export const FLAG_CONSUMED = 'consumed';

/** Actor flag with the catalog entries and requests, see RequestController. */
export const FLAG_REQUESTS = 'requests';

/** Id of the planner tab's part on the character sheet. */
export const PART_ID = 'steigerungsplaner';

/** World setting: a value typed into the sheet's fields plans the steps instead of setting it. */
export const SETTING_INPUT_PLANS = 'inputPlans';

/** World setting: whether the advancement phase is used at all, see PlannerPhase. */
export const SETTING_PHASE_ENABLED = 'advancementPhase';

/** World setting: whether the advancement phase is open right now - the switch in the overview. */
export const SETTING_PHASE_OPEN = 'advancementPhaseOpen';

/**
 * The sheet's "+" functions (data-fct of the system's advanceWrapper action) mapped to our target
 * types.
 * @type {Record<string, string>}
 */
export const ADVANCE_FCTS = {
  _advanceAttribute: 'attribute',
  _advancePoints: 'point',
  _advanceItem: 'item',
  _rebuyPC: 'permanentLoss',
};

/**
 * The sheet's "-" functions mapped to our target types.
 * @type {Record<string, string>}
 */
export const REFUND_FCTS = {
  _refundAttributeAdvance: 'attribute',
  _refundPointsAdvance: 'point',
  _refundItemAdvance: 'item',
  _refundPC: 'permanentLoss',
};

/**
 * Both, for places that only care which target a button belongs to, e.g. the badges.
 * @type {Record<string, string>}
 */
export const ALL_FCTS = { ...ADVANCE_FCTS, ...REFUND_FCTS };
