import { MODULE_ID, SETTING_INPUT_PLANS } from './module-config.js';
import PlannerController from './planner-controller.js';

// The sheet's number fields for the same targets shift-click plans (talent values, attribute and
// base stat advances, permanent AsP/KaP rebuys) normally just overwrite the value without any AP.
// With the world setting on, a value typed there plans the steps up (or down) to it instead.
// The GM can still set a value directly with Ctrl+Enter. A value set directly - that way, or with
// the setting off - is set just like the system would, and the target's plan is rebased onto it.
//
// Item values have their own jQuery change handler on the input, the others go through the
// form's submit-on-change. Both are stopped by listening on the sheet in the capture phase, before
// the event gets to either. Enter is handled on keydown, so it doesn't submit the form either.
const NAMED_FIELDS = [
  [/^system\.characteristics\.(\w+)\.advances$/, 'attribute'],
  [/^system\.status\.(wounds|astralenergy|karmaenergy)\.advances$/, 'point'],
  [/^system\.status\.(astralenergy|karmaenergy)\.rebuy$/, 'permanentLoss'],
];

export default class PlannerInput {
  static #attached = new WeakSet();
  // Inputs the GM just set with Ctrl+Enter - the browser still fires a change for them when they
  // lose focus, which must not plan on top. Cleared on focusout, which comes after that change, or
  // as soon as they type again.
  static #setDirectly = new WeakSet();

  static attach(sheet) {
    const element = sheet.element;
    if (this.#attached.has(element)) return;
    this.#attached.add(element);

    element.addEventListener('keydown', (ev) => this.#onKeydown(sheet, ev), true);
    element.addEventListener('change', (ev) => this.#onChange(sheet, ev), true);
    element.addEventListener('focusout', (ev) => this.#setDirectly.delete(ev.target), true);
    element.addEventListener('input', (ev) => this.#setDirectly.delete(ev.target), true);
  }

  // 'plan' if a typed value plans, 'set' if it's set directly (setting off), null where the
  // sheet has no advancing at all (no "+"/"-" buttons) - then there's no plan to keep in line.
  static #mode(sheet) {
    const actor = sheet.actor;
    if (!actor.isOwner || !(actor.canAdvance ?? true)) return null;
    return game.settings.get(MODULE_ID, SETTING_INPUT_PLANS) ? 'plan' : 'set';
  }

  // Which target an input belongs to: { type, key, offset }, offset being what the field's number
  // is short of the target's value (attributes show only their advances, the value adds the initial).
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

  static #onChange(sheet, ev) {
    const target = this.#targetFor(sheet, ev.target);
    const mode = target && this.#mode(sheet);
    if (!mode) return;

    ev.stopPropagation();
    if (this.#setDirectly.has(ev.target)) return;
    if (mode === 'set') this.#set(sheet, ev.target, target);
    else this.#plan(sheet, ev.target, target);
  }

  // Resets the field to what the sheet showed - the plan is what changed, not the value. Which also
  // means the browser sees no change left to report when the field loses focus after Enter.
  static async #plan(sheet, input, { type, key, offset }) {
    const text = input.value.trim();
    const value = Number(text);
    input.value = input.defaultValue;
    if (!text || input.value === text || !Number.isInteger(value)) return;

    await PlannerController.planTo(sheet.actor, type, key, value + offset);
    sheet.render();
  }

  // What the system would have done with the value, then the plan is brought in line with it right
  // away instead of only when the sheet is opened next.
  static async #set(sheet, input, { type, key }) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;

    if (type === 'item') await sheet.actor.updateEmbeddedDocuments('Item', [{ _id: key, 'system.talentValue.value': value }]);
    else await sheet.actor.update({ [input.name]: value });

    await PlannerController.rebaseQueue(sheet.actor, type, key);
    sheet.render();
  }
}
