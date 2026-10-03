import PlannerController from './planner-controller.js';
import RequestController from './request-controller.js';

// If a talent/spell/combat-skill item with queued plan steps gets deleted (player removes it,
// a wizard replaces it, ...), its plan entries would otherwise survive pointing at a dead item
// id - and clicking "apply" on one would crash inside the system's own _advanceItem. Purge them
// as soon as the item is gone. Not tied to any particular sheet, so this only needs registering
// once, independent of whether/which actor sheet is currently open.
export function registerCleanupHooks() {
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
