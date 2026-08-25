import { MODULE_ID } from './module-config.js';
import { registerSheetIntegration } from './sheet-integration.js';

Hooks.once('ready', () => {
  if (!game.modules.get('lib-wrapper')?.active) {
    console.error(`${MODULE_ID} | lib-wrapper needs to be installed and active.`);
    return;
  }
  registerSheetIntegration();
});
