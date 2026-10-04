import { MODULE_ID, SETTING_INPUT_PLANS } from './module-config.js';
import { registerCleanupHooks } from './planner-cleanup.js';
import { registerSheetIntegration } from './sheet-integration.js';
import RequestApproval from './request-approval.js';

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
});

Hooks.once('ready', () => {
  registerCleanupHooks();
  RequestApproval.register();

  if (!game.modules.get('lib-wrapper')?.active) {
    console.error(`${MODULE_ID} | lib-wrapper needs to be installed and active.`);
    return;
  }
  registerSheetIntegration();
});
