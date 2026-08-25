import { ADVANCE_FCTS, MODULE_ID } from './module-config.js';
import PlannerController from './planner-controller.js';
import PlannerTab from './planner-tab.js';

// Foundry registers sheets under `${scope}.${className}` - stable enough to rely on directly.
const CHARACTER_SHEET_ID = 'dsa5.ActorSheetdsa5Character';

function findCharacterSheetClass() {
  const cls = CONFIG.Actor.sheetClasses?.character?.[CHARACTER_SHEET_ID]?.cls;
  return cls ? { id: CHARACTER_SHEET_ID, cls } : null;
}

// character-sheet.js declares its own static DEFAULT_OPTIONS, which completely shadows
// (not merges with) the base class's - ownerActions.advanceWrapper only exists on whichever
// ancestor class actually declares it as its own property. Walk up until we find it.
function findOwnerActionsOwner(cls) {
  let current = cls;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, 'DEFAULT_OPTIONS') && current.DEFAULT_OPTIONS?.ownerActions?.advanceWrapper) {
      return current;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

export function registerSheetIntegration() {
  const found = findCharacterSheetClass();
  if (!found) {
    console.error(`${MODULE_ID} | ActorSheetdsa5Character wurde nicht gefunden - Steigerungsplaner bleibt inaktiv.`);
    return;
  }

  const { id, cls } = found;

  // PARTS/TABS are plain mutable objects - no wrapping needed to add our tab. PARTS is safe to
  // mutate directly: character-sheet.js declares its own full PARTS object, not inherited.
  cls.PARTS[PlannerTab.partId] = {
    template: `modules/${MODULE_ID}/templates/planner-tab.hbs`,
    scrollable: [''],
  };

  // TABS, however, is NOT redeclared by character-sheet.js (or creature-sheet.js/npc-sheet.js) -
  // they all inherit the exact same TABS object from the ActorSheetDsa5 base class. Mutating it
  // in place would leak our tab button into creature/NPC sheets too, which have no matching PART
  // for it. Clone it into an own property on the character class first, like PARTS already is.
  cls.TABS = foundry.utils.deepClone(cls.TABS);
  cls.TABS.sheet.tabs.push({
    id: PlannerTab.partId,
    label: 'STEIGERUNGSPLANER.Tab',
    icon: 'fas fa-list-check',
  });

  const basePath = `CONFIG.Actor.sheetClasses.character["${id}"].cls`;

  // Shift-click on any advance/refund "+"/"-" button plans/cancels a step instead of
  // executing it; a normal click falls through to the original behaviour unchanged.
  //
  // NOTE: `_advanceWrapper` itself is captured by reference into DEFAULT_OPTIONS.ownerActions
  // once, when the owning class body evaluates - wrapping the class method after the fact would
  // patch a property nobody reads again. We wrap the actual object property Foundry re-reads on
  // every new sheet instance instead. That property only exists on whichever ancestor class
  // declares it (see findOwnerActionsOwner), which isn't reachable via the sheet registry, so we
  // park a reference to it on our own module's api for libWrapper's string-path resolver to find.
  const ownerActionsOwner = findOwnerActionsOwner(cls);
  if (!ownerActionsOwner) {
    console.error(`${MODULE_ID} | Konnte ownerActions.advanceWrapper in der Klassenhierarchie nicht finden - Shift-Klick bleibt inaktiv.`);
  } else {
    // libWrapper's target string only supports property/bracket-index paths, not method calls
    // like `game.modules.get(...)` - so we need a plain, global, string-indexable anchor.
    globalThis.__dsa5Steigerungsplaner = { ownerActionsOwner };

    libWrapper.register(
      MODULE_ID,
      `globalThis.__dsa5Steigerungsplaner.ownerActionsOwner.DEFAULT_OPTIONS.ownerActions.advanceWrapper`,
      function (wrapped, ev, target) {
        const fct = target?.dataset?.fct;
        if (!ev.shiftKey || !fct) return wrapped(ev, target);
        ev.preventDefault();
        PlannerController.handleShiftClick(this, fct, target.dataset.attr);
      },
      'MIXED',
    );
  }

  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._preparePartContext`,
    async function (wrapped, partId, context, options) {
      context = await wrapped(partId, context, options);
      if (partId === PlannerTab.partId) context = await PlannerTab.prepareContext(this, context);
      return context;
    },
    'MIXED',
  );

  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._attachPartListeners`,
    function (wrapped, partId, element, options) {
      wrapped(partId, element, options);
      if (partId === PlannerTab.partId) PlannerTab.attachListeners(this, element);
    },
    'MIXED',
  );

  // _advanceAttribute/_advancePoints/_advanceItem are normal prototype methods (unlike
  // advanceWrapper, not captured by value anywhere) and resolve to true when the advance was
  // actually carried out. Whenever that happens - via a normal un-shifted click OR via our own
  // "apply" button in the planner tab - drop the oldest queued plan entry for that same target,
  // since it was just de facto executed.
  for (const [methodName, type] of Object.entries(ADVANCE_FCTS)) {
    libWrapper.register(
      MODULE_ID,
      `${basePath}.prototype.${methodName}`,
      async function (wrapped, key) {
        const result = await wrapped(key);
        if (result) await PlannerController.consumeOldest(this.actor, type, key);
        return result;
      },
      'MIXED',
    );
  }
}
