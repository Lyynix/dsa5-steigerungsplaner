/**
 * @file Hooks the planner into the system's character sheet with libWrapper: adds the tab, makes
 * shift-click on "+"/"-" plan instead of advance, keeps the plan in line with real advances and
 * refunds, decorates the sheet and holds advancing back outside the advancement phase.
 */

import { ALL_FCTS, MODULE_ID } from '../config.js';
import PlannerBadges from './badges.js';
import PlannerController from '../plan/controller.js';
import PlannerHints from './hints.js';
import PlannerInput from './input.js';
import PlannerPhase from '../phase.js';
import PlannerTab from './tab.js';

/** Foundry registers sheets under `${scope}.${className}` - stable enough to rely on directly. */
const CHARACTER_SHEET_ID = 'dsa5.ActorSheetdsa5Character';

/**
 * The system's character sheet class.
 * @returns {?{id: string, cls: typeof ActorSheet}}
 */
function findCharacterSheetClass() {
  const cls = CONFIG.Actor.sheetClasses?.character?.[CHARACTER_SHEET_ID]?.cls;
  return cls ? { id: CHARACTER_SHEET_ID, cls } : null;
}

/**
 * The class in the hierarchy that declares an owner action in its own DEFAULT_OPTIONS. A subclass's
 * DEFAULT_OPTIONS shadows its parent's instead of merging with it, so the action only exists on the
 * class that declares it.
 * @param {Function} cls
 * @param {string} [action]
 * @returns {?Function}
 */
function findOwnerActionsOwner(cls, action = 'advanceWrapper') {
  let current = cls;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, 'DEFAULT_OPTIONS') && current.DEFAULT_OPTIONS?.ownerActions?.[action]) {
      return current;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

/**
 * The class with the item sheets' own "+"/"-" (a skill's or spell's sheet): the system's base item
 * sheet, which every dsa5 item sheet inherits.
 * @returns {?Function}
 */
function findItemAdvanceOwner() {
  for (const sheets of Object.values(CONFIG.Item.sheetClasses ?? {})) {
    for (const [id, { cls }] of Object.entries(sheets)) {
      if (!id.startsWith('dsa5.')) continue;
      const owner = findOwnerActionsOwner(cls, '_advanceStep');
      if (owner) return owner;
    }
  }
  return null;
}

/** Registers the tab and all wraps. Called once on ready, with libWrapper active. */
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

  // TABS is inherited from the base class, shared with the creature and NPC sheets - changed in
  // place, our tab would show up there too. Cloned into an own property first.
  cls.TABS = foundry.utils.deepClone(cls.TABS);
  cls.TABS.sheet.tabs.push({
    id: PlannerTab.partId,
    label: 'STEIGERUNGSPLANER.Title',
    icon: 'fas fa-list-check',
  });

  const basePath = `CONFIG.Actor.sheetClasses.character["${id}"].cls`;

  // Shift-click on "+"/"-" plans or takes back a step instead; a normal click goes through
  // unchanged. advanceWrapper is read from DEFAULT_OPTIONS.ownerActions for every new sheet, so
  // that property is wrapped, not the class method - on the ancestor class that declares it.
  const ownerActionsOwner = findOwnerActionsOwner(cls);
  if (!ownerActionsOwner) {
    console.error(`${MODULE_ID} | Konnte ownerActions.advanceWrapper in der Klassenhierarchie nicht finden - Shift-Klick bleibt inaktiv.`);
  } else {
    // libWrapper's target string only supports property paths, not calls like
    // `game.modules.get(...)` - so a global anchor it can resolve.
    globalThis.__dsa5Steigerungsplaner = { ownerActionsOwner };

    libWrapper.register(
      MODULE_ID,
      `globalThis.__dsa5Steigerungsplaner.ownerActionsOwner.DEFAULT_OPTIONS.ownerActions.advanceWrapper`,
      function (wrapped, ev, target) {
        const fct = target?.dataset?.fct;
        if (!ev.shiftKey || !fct) {
          // Outside the advancement phase only planning works, not advancing for real.
          if (fct in ALL_FCTS && PlannerPhase.locked) {
            ev.preventDefault();
            PlannerPhase.warn();
            return;
          }
          return wrapped(ev, target);
        }
        ev.preventDefault();
        PlannerController.handleShiftClick(this, fct, target.dataset.attr);
      },
      'MIXED',
    );
  }

  // The same for the item sheets' "+"/"-" - no planning there, they only advance for real.
  const itemAdvanceOwner = findItemAdvanceOwner();
  if (!itemAdvanceOwner) {
    console.error(`${MODULE_ID} | Konnte ownerActions._advanceStep der Item-Bögen nicht finden - die Steigerungsphase sperrt dort nicht.`);
  } else {
    (globalThis.__dsa5Steigerungsplaner ??= {}).itemAdvanceOwner = itemAdvanceOwner;
    for (const action of ['_advanceStep', '_refundStep']) {
      libWrapper.register(
        MODULE_ID,
        `globalThis.__dsa5Steigerungsplaner.itemAdvanceOwner.DEFAULT_OPTIONS.ownerActions.${action}`,
        function (wrapped, ev, target) {
          if (this.item?.actor && PlannerPhase.locked) {
            ev.preventDefault();
            PlannerPhase.warn();
            return;
          }
          return wrapped(ev, target);
        },
        'MIXED',
      );
    }
  }

  // The tab only for owners (the GM always is one), like the system hides its magic/religion tabs.
  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._prepareTabs`,
    function (wrapped, group) {
      const tabs = wrapped(group);
      if (group === 'sheet' && !this.actor.isOwner) delete tabs[PlannerTab.partId];
      return tabs;
    },
    'MIXED',
  );

  // The tab's render context.
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

  // The tab's listeners.
  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._attachPartListeners`,
    function (wrapped, partId, element, options) {
      wrapped(partId, element, options);
      if (partId === PlannerTab.partId) PlannerTab.attachListeners(this, element);
    },
    'MIXED',
  );

  // Once per opened sheet, not per render: see PlannerController.validateQueues.
  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._onFirstRender`,
    async function (wrapped, context, options) {
      await wrapped(context, options);
      await PlannerController.validateQueues(this.actor);
    },
    'MIXED',
  );

  // Old consumed steps are cleaned up when the sheet closes - while it's open, the player might
  // still want to undo something (see PlannerController.pruneConsumed).
  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._onClose`,
    function (wrapped, options) {
      const result = wrapped(options);
      PlannerController.pruneConsumed(this.actor);
      return result;
    },
    'MIXED',
  );

  // After every full render, with all parts in place: badges, hints and the input fields across the
  // whole sheet, whichever tab is active.
  libWrapper.register(
    MODULE_ID,
    `${basePath}.prototype._onRender`,
    async function (wrapped, context, options) {
      await wrapped(context, options);
      PlannerBadges.decorate(this);
      PlannerHints.decorate(this);
      PlannerInput.attach(this);
    },
    'MIXED',
  );

  // The six advance/refund methods resolve to true when the change was carried out. Then the plan is
  // brought in line - from a normal click or the tab's apply alike, see PlannerController.reconcile.
  for (const [methodName, type] of Object.entries(ALL_FCTS)) {
    libWrapper.register(
      MODULE_ID,
      `${basePath}.prototype.${methodName}`,
      async function (wrapped, key) {
        const result = await wrapped(key);
        if (result) {
          const value = PlannerController.rawCurrentValue(this.actor, type, key);
          if (value !== null) await PlannerController.reconcile(this.actor, type, key, value);
        }
        return result;
      },
      'MIXED',
    );
  }
}
