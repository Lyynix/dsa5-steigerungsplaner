/**
 * @file The advancement phase. Many groups only advance at certain points, e.g. after an adventure.
 * With the world setting on, players can plan anytime, but applying planned steps, the sheet's normal
 * "+"/"-", setting values directly and sending requests only work while the GM has the phase open -
 * in the GM's overview or the module settings. The GM is never held back.
 */

import { MODULE_ID, SETTING_PHASE_ENABLED, SETTING_PHASE_OPEN } from './config.js';

/** Settings and state of the advancement phase. */
export default class PlannerPhase {
  /** Registers both world settings. Called on init. */
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

  /**
   * Whether the world uses an advancement phase.
   * @type {boolean}
   */
  static get enabled() {
    return game.settings.get(MODULE_ID, SETTING_PHASE_ENABLED);
  }

  /**
   * Whether the GM has the phase open right now.
   * @type {boolean}
   */
  static get open() {
    return game.settings.get(MODULE_ID, SETTING_PHASE_OPEN);
  }

  /**
   * Whether the current user is held back right now - never the GM.
   * @type {boolean}
   */
  static get locked() {
    return this.enabled && !this.open && !game.user.isGM;
  }

  /**
   * Opens or closes the phase. GM only.
   * @param {boolean} open
   * @returns {Promise<void>}
   */
  static async setOpen(open) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, SETTING_PHASE_OPEN, open);
  }

  /** The notification for every place that refuses because of the phase. */
  static warn() {
    ui.notifications.warn(game.i18n.localize('STEIGERUNGSPLANER.Phase.Locked'));
  }

  /** Re-renders what shows the phase: character sheets (the tab) and the overview (the switch). */
  static #rerender() {
    for (const app of foundry.applications.instances.values()) {
      if (!app.rendered) continue;
      if (app.document?.type === 'character' || app.id === 'steigerungsplaner-overview') app.render();
    }
  }
}
