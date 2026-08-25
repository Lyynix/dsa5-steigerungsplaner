import PlannerController from './planner-controller.js';

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
}
