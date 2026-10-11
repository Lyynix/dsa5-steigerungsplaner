/**
 * @file Hooks that keep the plan and the requests in line with the actor's items, no matter which
 * sheet - if any - is open.
 */

import PlannerController from './plan/controller.js';
import RequestController from './requests/controller.js';

/** Registers the hooks. Called once on ready. */
export function registerCleanupHooks() {
  // Planned steps of a deleted item would point at a dead id, and applying one would crash inside
  // the system's own _advanceItem.
  Hooks.on('deleteItem', async (item) => {
    const actor = item.actor;
    if (!actor) return;
    await PlannerController.purgeTarget(actor, 'item', item.id);
  });

  // A request the character got some other way - the GM dragged the item onto the sheet, the
  // player bought it themselves - is done, otherwise it would keep counting into the planned cost.
  // Only the client that made the change cleans up, so the flag isn't written by several at once.
  const pruneRequests = (item, userId) => {
    if (userId !== game.user.id || !item.actor) return;
    RequestController.pruneFulfilled(item.actor);
  };
  Hooks.on('createItem', (item, options, userId) => pruneRequests(item, userId));
  Hooks.on('updateItem', (item, changes, options, userId) => {
    if ('name' in changes || foundry.utils.hasProperty(changes, 'system.step.value')) pruneRequests(item, userId);
  });
}
