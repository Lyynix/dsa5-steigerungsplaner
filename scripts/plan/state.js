/**
 * @file Runtime state of the plan. Its own file so plan/data.js can read it without importing
 * sheet/tab.js, which sets it - that would be a circular import.
 */

/**
 * Ids of plan steps being applied right now. The real advance's actor.update() re-renders the sheet
 * before PlannerController.reconcile() has removed the step from the flag - without this, the step
 * would flash back for that one render.
 * @type {Set<string>}
 */
export const applyingIds = new Set();
