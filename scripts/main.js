/**
 * @file Entry point of the module. Registers the settings on init and hooks everything else in on
 * ready: the cleanup hooks, the GM's overview and - if libWrapper is active - the character sheet.
 */

import { MODULE_ID, SETTING_INPUT_PLANS } from './config.js';
import PlannerPhase from './phase.js';
import { registerCleanupHooks } from './cleanup.js';
import { registerSheetIntegration } from './sheet/integration.js';
import PlannerOverview from './overview.js';

Hooks.once('init', () => {
  // On by default; switching it off makes the fields set values directly again, e.g. while
  // building a character.
  game.settings.register(MODULE_ID, SETTING_INPUT_PLANS, {
    name: 'STEIGERUNGSPLANER.Settings.inputPlans.name',
    hint: 'STEIGERUNGSPLANER.Settings.inputPlans.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  PlannerPhase.registerSettings();
});

Hooks.once('ready', () => {
  registerCleanupHooks();
  PlannerOverview.register();

  if (!game.modules.get('lib-wrapper')?.active) {
    console.error(`${MODULE_ID} | lib-wrapper needs to be installed and active.`);
    return;
  }
  registerSheetIntegration();
});
