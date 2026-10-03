import { MODULE_ID } from './module-config.js';
import RequestController from './request-controller.js';
import RequestIndex from './request-index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// The window a player picks things to request from (special abilities, spells, ...): the list on
// the left, the selected entry's details on the right. It stays open so several things can be added
// in a row - after adding, the search field gets focus with its text selected, so typing replaces it.
export default class RequestPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ['steigerungsplaner-request-picker'],
    position: { width: 880, height: 640 },
    window: { icon: 'fas fa-scroll', resizable: true },
    actions: {
      selectEntry: RequestPicker.#onSelectEntry,
      addRequest: RequestPicker.#onAddRequest,
    },
  };

  static PARTS = {
    list: { template: `modules/${MODULE_ID}/templates/request-picker-list.hbs` },
    details: { template: `modules/${MODULE_ID}/templates/request-picker-details.hbs` },
  };

  // One window per character, a second click brings the open one to the front.
  static open(actor) {
    const id = `steigerungsplaner-request-picker-${actor.id}`;
    const app = foundry.applications.instances.get(id) ?? new RequestPicker(actor, { id });
    return app.render({ force: true });
  }

  #catalog = [];
  #documents = new Map();
  #selected = null;
  #query = '';
  #focusSearch = true;

  // The actor is kept out of the options on purpose - ApplicationV2 merges and freezes those.
  constructor(actor, options) {
    super(options);
    this.actor = actor;
  }

  get title() {
    return `${game.i18n.localize('STEIGERUNGSPLANER.RequestPickerTitle')}: ${this.actor.name}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#catalog = RequestController.catalog(this.actor, await RequestIndex.get());

    context.query = this.#query;
    context.groups = this.#catalog.map((group) => ({
      ...group,
      entries: group.entries.map((entry) => ({
        ...entry,
        label: entry.name.replace(' ()', ''),
        source: entry.sources.join(', '),
        selected: entry.uuid === this.#selected,
      })),
    }));
    context.entry = await this.#details();
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const search = this.element.querySelector('.picker-search');

    if (options.parts.includes('list')) {
      search.addEventListener('input', () => {
        this.#query = search.value;
        this.#filter();
      });
      this.#filter();
    }

    // The cost depends on the chosen level and variant, so it follows the fields.
    if (options.parts.includes('details') && context.entry) {
      const details = this.#detailsElement();
      for (const field of details.querySelectorAll('[name]')) {
        field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', () => this.#updateCost());
      }
      this.#updateCost();
    }

    if (this.#focusSearch) {
      search.focus();
      search.select();
      this.#focusSearch = false;
    }
  }

  #selectedEntry() {
    for (const group of this.#catalog) {
      const entry = group.entries.find((e) => e.uuid === this.#selected);
      if (entry) return { ...entry, groupLabel: group.label };
    }
    return null;
  }

  // The full item from its compendium, for what the index doesn't have (description, rules text).
  async #document(uuid) {
    if (!this.#documents.has(uuid)) this.#documents.set(uuid, await fromUuid(uuid));
    return this.#documents.get(uuid);
  }

  async #details() {
    const entry = this.#selectedEntry();
    if (!entry) return null;

    const doc = await this.#document(entry.uuid);
    const enrich = (html) => (html ? foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { relativeTo: doc, secrets: doc?.isOwner }) : '');
    const system = doc?.system;

    const levels = entry.level ? Array.from({ length: entry.level.max - entry.level.min + 1 }, (_, i) => entry.level.min + i) : [];
    return {
      ...entry,
      label: entry.name.replace(' ()', ''),
      source: entry.sources.join(', '),
      levels,
      variantText: entry.variant?.kind === 'text',
      extensionTooLow: !!entry.extension && entry.extension.currentFW < entry.extension.requiredFW,
      // The same short facts the system posts to chat (rule, casting time, AsP cost, ...); it leaves
      // them out itself if the GM obfuscated the details.
      properties: system?.chatDataToString ? await enrich(system.chatDataToString(doc.name)) : '',
      description: system && !system.obfuscation?.description ? await enrich(system.description?.value) : '',
      stf: ['spell', 'ritual', 'liturgy', 'ceremony'].includes(entry.type) ? system?.StF?.value : null,
      leveled: !!entry.level,
    };
  }

  #detailsElement() {
    return this.element.querySelector('[data-application-part="details"]');
  }

  // The level and variant currently chosen in the details. `missingVariant` is set when a variant is
  // needed but none is entered, the cost can still be shown without it for most items.
  #readChoice(entry) {
    const details = this.#detailsElement();
    const level = entry.level ? Number(details.querySelector('[name="level"]').value) : null;

    let variant = null;
    if (entry.variant?.kind === 'text') {
      const name = details.querySelector('[name="variant"]').value.trim();
      if (name) variant = { name };
    } else if (entry.variant) {
      const option = entry.variant.options[Number(details.querySelector('[name="variant"]').value)];
      if (option) {
        variant = { ...option };
        const custom = details.querySelector('[name="custom"]')?.value.trim();
        if (custom) variant.customEntry = custom;
      }
    }
    return { level, variant, missingVariant: !!entry.variant && !variant };
  }

  async #updateCost() {
    const entry = this.#selectedEntry();
    const details = this.#detailsElement();
    if (!entry || !details) return;

    const doc = (await this.#document(entry.uuid)) ?? entry;
    const { level, variant } = this.#readChoice(entry);
    const unknown = game.i18n.localize('STEIGERUNGSPLANER.CostUnknown');

    const cost = RequestController.estimateCost(this.actor, doc, { level, variant });
    const costField = details.querySelector('.picker-cost');
    if (costField) costField.textContent = cost === null ? `${unknown} (${doc.system.APValue?.value ?? '?'})` : `${cost} AP`;

    const levelField = details.querySelector('.picker-level-costs');
    if (levelField) {
      const costs = RequestController.levelCosts(this.actor, doc, variant);
      levelField.textContent = costs ? costs.map((c) => `${c}`).join(' / ') : unknown;
    }
  }

  // Matches either an entry's name or its group's, so "Kampf" lists all combat special abilities.
  #filter() {
    const q = this.#query.trim().toLowerCase();
    let anyVisible = false;

    for (const group of this.element.querySelectorAll('.picker-group')) {
      const groupMatches = group.querySelector('.picker-group-label').textContent.toLowerCase().includes(q);
      let groupVisible = false;
      for (const li of group.querySelectorAll('.picker-entry')) {
        li.hidden = !groupMatches && !li.querySelector('.picker-entry-name').textContent.toLowerCase().includes(q);
        if (!li.hidden) groupVisible = true;
      }
      group.hidden = !groupVisible;
      anyVisible ||= groupVisible;
    }

    this.element.querySelector('.picker-empty').hidden = anyVisible;
  }

  // Only the details are re-rendered, so the list keeps its scroll position and search.
  static #onSelectEntry(event, target) {
    this.#selected = target.dataset.uuid;
    for (const li of this.element.querySelectorAll('.picker-entry')) li.classList.toggle('selected', li === target);
    this.render({ parts: ['details'] });
  }

  static async #onAddRequest() {
    const entry = this.#selectedEntry();
    if (!entry) return;

    const { level, variant, missingVariant } = this.#readChoice(entry);
    if (missingVariant) return ui.notifications.warn(game.i18n.localize('STEIGERUNGSPLANER.VariantMissing'));

    const added = await RequestController.addRequest(this.actor, entry, { level, variant });
    if (!added) ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.RequestExists', { name: entry.name.replace(' ()', '') }));

    // The list too: entries without a variant drop out of it once they're requested.
    this.#focusSearch = true;
    await this.render({ parts: ['list', 'details'] });
  }
}
