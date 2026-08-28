// Entry ids currently mid-"apply": the real advance/refund method's own actor.update() triggers
// a sheet re-render before PlannerController.reconcile() has removed the entry from the plan
// flag, so a queued step would otherwise flash back to full size for that render before vanishing
// for good on the next one. Kept here (rather than on PlannerController) to avoid a circular
// import with planner-data.js, which needs to read this set too.
export const applyingIds = new Set();
