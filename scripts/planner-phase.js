import { MODULE_ID, SETTING_PHASE_ENABLED, SETTING_PHASE_OPEN } from './module-config.js';

// The advancement phase: many groups only advance at certain points, e.g. after an adventure. With
// the world setting on, players can plan anytime, but applying planned steps, the sheet's normal
// "+"/"-", setting values directly and sending requests only work while the GM has the phase open -
// in the GM's overview or the module settings. The GM is never held back.
export default class PlannerPhase {
  static registerSettings() {
    game.settings.register(MODULE_ID, SETTING_PHASE_ENABLED, {
      name: 'STEIGERUNGSPLANER.Settings.phaseEnabled.name',
      hint: 'STEIGERUNGSPLANER.Settings.phaseEnabled.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: () => this.#rerender(),
    });

    game.settings.register(MODULE_ID, SETTING_PHASE_OPEN, {
      name: 'STEIGERUNGSPLANER.Settings.phaseOpen.name',
      hint: 'STEIGERUNGSPLANER.Settings.phaseOpen.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: (open) => {
        // Only worth telling the players if the phase is used at all.
        if (this.enabled && !game.user.isGM) {
          ui.notifications.info(game.i18n.localize(open ? 'STEIGERUNGSPLANER.Phase.Opened' : 'STEIGERUNGSPLANER.Phase.Closed'));
        }
        this.#rerender();
      },
    });
  }

  static get enabled() {
    return game.settings.get(MODULE_ID, SETTING_PHASE_ENABLED);
  }

  static get open() {
    return game.settings.get(MODULE_ID, SETTING_PHASE_OPEN);
  }

  // Whether the current user is held back right now - never the GM.
  static get locked() {
    return this.enabled && !this.open && !game.user.isGM;
  }

  static async setOpen(open) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, SETTING_PHASE_OPEN, open);
  }

  // For every place that refuses because of it.
  static warn() {
    ui.notifications.warn(game.i18n.localize('STEIGERUNGSPLANER.Phase.Locked'));
  }

  // Character sheets (their planner tab shows the phase) and the GM's overview (its switch).
  static #rerender() {
    for (const app of foundry.applications.instances.values()) {
      if (!app.rendered) continue;
      if (app.document?.type === 'character' || app.id === 'steigerungsplaner-overview') app.render();
    }
  }
}
