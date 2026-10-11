/**
 * @file The "Plan value" dropdown: a popover at the mouse listing the targets with nothing planned
 * yet, grouped by section and searchable. Not Foundry's ContextMenu - it has no search field, and
 * ~80 skills without one would be unusable.
 */

import PlannerController from './controller.js';

/** Section ids in the sheet's order; unknown ones go last. */
const SECTION_ORDER = [
  'characteristics',
  'points',
  'skill-body',
  'skill-social',
  'skill-nature',
  'skill-knowledge',
  'skill-trade',
  'combat',
  'magic',
  'religion',
  'other',
];

/** Minimum distance to the window's edges, in px. */
const MARGIN = 8;

/** The dropdown. Only one is open at a time. */
export default class PlannerPicker {
  /** @type {?HTMLElement} */
  static #element = null;
  /** @type {?function(PointerEvent)} */
  static #onPointerDown = null;
  /** @type {?function(KeyboardEvent)} */
  static #onKeyDown = null;

  /**
   * Opens the dropdown at the mouse. Picking a target plans its first step.
   * @param {ActorSheet} sheet
   * @param {MouseEvent} event   The click that opened it.
   */
  static open(sheet, event) {
    this.close();
    if (!sheet.actor.isOwner) return;

    const el = document.createElement('nav');
    el.className = 'steigerungsplaner-picker';

    // Same as Foundry's own ContextMenu: take the theme of the nearest themed ancestor, since the
    // picker lives on document.body and wouldn't inherit the sheet's theme otherwise.
    const themed = sheet.element.closest('.themed') ?? document.body;
    const [, theme] = themed.className.match(/(?:^|\s)(theme-\w+)/) ?? [];
    if (theme) el.classList.add('themed', theme);

    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = game.i18n.localize('STEIGERUNGSPLANER.Picker.Search');

    const list = document.createElement('ol');
    list.className = 'picker-list';

    // Built with textContent rather than an HTML string - item names are user-editable.
    for (const [section, targets] of this.#group(PlannerController.candidateTargets(sheet.actor))) {
      const heading = document.createElement('li');
      heading.className = 'picker-section';
      heading.textContent = section.label;
      list.append(heading);

      for (const target of targets) {
        const item = document.createElement('li');
        item.className = 'picker-item';
        item.dataset.type = target.type;
        item.dataset.key = target.key;
        if (target.icon) {
          const img = document.createElement('img');
          img.src = target.icon;
          img.alt = '';
          item.append(img);
        }
        const label = document.createElement('span');
        label.textContent = target.label;
        item.append(label);
        list.append(item);
      }
    }

    const empty = document.createElement('p');
    empty.className = 'picker-empty';
    empty.textContent = game.i18n.localize('STEIGERUNGSPLANER.Picker.Empty');

    el.append(search, list, empty);
    document.body.append(el);
    this.#element = el;
    this.#filter('');
    this.#position(el, event.clientX, event.clientY);

    search.addEventListener('input', () => this.#filter(search.value));
    search.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      list.querySelector('.picker-item:not([hidden])')?.click();
    });

    list.addEventListener('click', async (ev) => {
      const item = ev.target.closest('.picker-item');
      if (!item) return;
      this.close();
      await PlannerController.planStep(sheet.actor, item.dataset.type, item.dataset.key, 'increase');
      sheet.render();
    });

    // Capture phase, so a click elsewhere closes the picker even if that target stops propagation.
    this.#onPointerDown = (ev) => {
      if (!el.contains(ev.target)) this.close();
    };
    this.#onKeyDown = (ev) => {
      if (ev.key === 'Escape') this.close();
    };
    document.addEventListener('pointerdown', this.#onPointerDown, true);
    document.addEventListener('keydown', this.#onKeyDown);

    search.focus();
  }

  /** Closes the dropdown, if open. */
  static close() {
    this.#element?.remove();
    this.#element = null;
    document.removeEventListener('pointerdown', this.#onPointerDown, true);
    document.removeEventListener('keydown', this.#onKeyDown);
  }

  /**
   * Groups the targets by section, in SECTION_ORDER.
   * @param {object[]} targets   From PlannerController.candidateTargets.
   * @returns {Array<[object, object[]]>} [section, targets] pairs.
   */
  static #group(targets) {
    const sections = new Map();
    for (const target of targets) {
      if (!sections.has(target.section.id)) sections.set(target.section.id, [target.section, []]);
      sections.get(target.section.id)[1].push(target);
    }

    const rank = (id) => {
      const idx = SECTION_ORDER.indexOf(id);
      return idx === -1 ? SECTION_ORDER.length : idx;
    };
    return [...sections.values()].sort((a, b) => rank(a[0].id) - rank(b[0].id));
  }

  /**
   * Hides what doesn't match. A target matches by its own name or its section's, so "Kampf" lists
   * all combat techniques.
   * @param {string} query
   */
  static #filter(query) {
    const q = query.trim().toLowerCase();
    let heading = null;
    let sectionMatches = false;
    let sectionHasVisible = false;
    let anyVisible = false;

    const closeSection = () => {
      if (heading) heading.hidden = !sectionHasVisible;
    };

    for (const li of this.#element.querySelectorAll('.picker-list > li')) {
      if (li.classList.contains('picker-section')) {
        closeSection();
        heading = li;
        sectionMatches = li.textContent.toLowerCase().includes(q);
        sectionHasVisible = false;
        continue;
      }
      li.hidden = !sectionMatches && !li.textContent.toLowerCase().includes(q);
      if (!li.hidden) sectionHasVisible = anyVisible = true;
    }
    closeSection();

    this.#element.querySelector('.picker-empty').hidden = anyVisible;
  }

  /**
   * Places the dropdown at the mouse, but inside the window: shifted left at the right edge,
   * flipped above the cursor at the bottom edge.
   * @param {HTMLElement} el
   * @param {number} x
   * @param {number} y
   */
  static #position(el, x, y) {
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = y + height > window.innerHeight - MARGIN ? Math.max(MARGIN, y - height) : y;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
}
