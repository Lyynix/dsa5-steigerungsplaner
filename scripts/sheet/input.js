/**
 * @file The sheet's number fields for plannable targets (skill values, attribute and base stat
 * advances, AsP/KaP rebuys). Normally they just overwrite the value without any AP. With the world
 * setting on, a value typed there plans the steps up or down to it instead. The GM can still set a
 * value directly with Ctrl+Enter. A value set directly - that way, or with the setting off - is set
 * like the system would, and the target's plan is rebased onto it.
 *
 * Item values have their own jQuery change handler on the input, the others go through the form's
 * submit-on-change. Both are stopped by listening on the sheet in the capture phase, before the
 * event gets to either. Enter is handled on keydown, so it doesn't submit the form either.
 */

import { MODULE_ID, SETTING_INPUT_PLANS } from '../config.js';
import PlannerController from '../plan/controller.js';
import PlannerPhase from '../phase.js';

/** Input names of the non-item fields, with the target type they belong to. */
const NAMED_FIELDS = [
  [/^system\.characteristics\.(\w+)\.advances$/, 'attribute'],
  [/^system\.status\.(wounds|astralenergy|karmaenergy)\.advances$/, 'point'],
  [/^system\.status\.(astralenergy|karmaenergy)\.rebuy$/, 'permanentLoss'],
];

/** The field handling. */
export default class PlannerInput {
  /**
   * Sheet elements the listeners are on already.
   * @type {WeakSet<HTMLElement>}
   */
  static #attached = new WeakSet();

  /**
   * Inputs the GM just set with Ctrl+Enter - the browser still fires a change for them when they
   * lose focus, which must not plan on top. Cleared on focusout, which comes after that change, or
   * as soon as they type again.
   * @type {WeakSet<HTMLInputElement>}
   */
  static #setDirectly = new WeakSet();

  /**
   * Adds the listeners to the sheet, once per element. Called after every render.
   * @param {ActorSheet} sheet
   */
  static attach(sheet) {
    const element = sheet.element;
    if (this.#attached.has(element)) return;
    this.#attached.add(element);

    element.addEventListener('keydown', (ev) => this.#onKeydown(sheet, ev), true);
    element.addEventListener('change', (ev) => this.#onChange(sheet, ev), true);
    element.addEventListener('focusout', (ev) => this.#setDirectly.delete(ev.target), true);
    element.addEventListener('input', (ev) => this.#setDirectly.delete(ev.target), true);
  }

  /**
   * What a typed value does on this sheet.
   * @param {ActorSheet} sheet
   * @returns {?('plan'|'set')} 'set' with the setting off, null where the sheet can't advance at all
   *   (no "+"/"-") - then there's no plan to keep in line.
   */
  static #mode(sheet) {
    const actor = sheet.actor;
    if (!actor.isOwner || !(actor.canAdvance ?? true)) return null;
    return game.settings.get(MODULE_ID, SETTING_INPUT_PLANS) ? 'plan' : 'set';
  }

  /**
   * The target an input belongs to.
   * @param {ActorSheet} sheet
   * @param {EventTarget} input
   * @returns {?{type: string, key: string, offset: number}} offset is what the field's number is
   *   short of the target's value - attributes show only their advances, the value adds the initial.
   */
  static #targetFor(sheet, input) {
    if (!(input instanceof HTMLInputElement)) return null;

    if (input.classList.contains('skill-advances')) {
      const itemId = input.closest('[data-item-id]')?.dataset.itemId;
      return itemId && sheet.actor.items.get(itemId) ? { type: 'item', key: itemId, offset: 0 } : null;
    }

    for (const [pattern, type] of NAMED_FIELDS) {
      const match = input.name?.match(pattern);
      if (!match) continue;
      const key = match[1];
      if (type === 'attribute') {
        const ch = sheet.actor.system.characteristics[key];
        return ch ? { type, key, offset: ch.initial } : null;
      }
      return { type, key, offset: 0 };
    }
    return null;
  }

  /**
   * Enter in a field: plans, or sets with Ctrl (GM) or the setting off.
   * @param {ActorSheet} sheet
   * @param {KeyboardEvent} ev
   */
  static #onKeydown(sheet, ev) {
    if (ev.key !== 'Enter') return;
    const target = this.#targetFor(sheet, ev.target);
    const mode = target && this.#mode(sheet);
    if (!mode) return;

    ev.preventDefault();
    ev.stopPropagation();

    if (mode === 'set' || (ev.ctrlKey && game.user.isGM)) {
      this.#setDirectly.add(ev.target);
      this.#set(sheet, ev.target, target);
    } else {
      this.#plan(sheet, ev.target, target);
    }
  }

  /**
   * A field's value changed without Enter, e.g. on leaving it.
   * @param {ActorSheet} sheet
   * @param {Event} ev
   */
  static #onChange(sheet, ev) {
    const target = this.#targetFor(sheet, ev.target);
    const mode = target && this.#mode(sheet);
    if (!mode) return;

    ev.stopPropagation();
    if (this.#setDirectly.has(ev.target)) return;
    if (mode === 'set') this.#set(sheet, ev.target, target);
    else this.#plan(sheet, ev.target, target);
  }

  /**
   * Plans the target to the typed value. The field goes back to what the sheet showed - the plan is
   * what changed, not the value. So the browser sees no change left to report when the field loses
   * focus after Enter either.
   * @param {ActorSheet} sheet
   * @param {HTMLInputElement} input
   * @param {{type: string, key: string, offset: number}} target
   * @returns {Promise<void>}
   */
  static async #plan(sheet, input, { type, key, offset }) {
    const text = input.value.trim();
    const value = Number(text);
    input.value = input.defaultValue;
    if (!text || input.value === text || !Number.isInteger(value)) return;

    await PlannerController.planTo(sheet.actor, type, key, value + offset);
    sheet.render();
  }

  /**
   * Sets the value like the system would, then brings the plan in line right away instead of only
   * when the sheet is opened next.
   * @param {ActorSheet} sheet
   * @param {HTMLInputElement} input
   * @param {{type: string, key: string}} target
   * @returns {Promise<void>}
   */
  static async #set(sheet, input, { type, key }) {
    // Outside the advancement phase nothing is set for real - the field shows the value again.
    if (PlannerPhase.locked) {
      input.value = input.defaultValue;
      return PlannerPhase.warn();
    }

    const value = Number(input.value);
    if (!Number.isFinite(value)) return;

    if (type === 'item') await sheet.actor.updateEmbeddedDocuments('Item', [{ _id: key, 'system.talentValue.value': value }]);
    else await sheet.actor.update({ [input.name]: value });

    await PlannerController.rebaseQueue(sheet.actor, type, key);
    sheet.render();
  }
}
