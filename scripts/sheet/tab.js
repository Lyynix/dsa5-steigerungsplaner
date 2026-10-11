/**
 * @file The planner tab on the character sheet: its render context and its listeners. The template
 * is templates/planner-tab.hbs, added as a part of the sheet by sheet/integration.js.
 */

import { PART_ID } from '../config.js';
import PlannerData from '../plan/data.js';
import PlannerLimits from '../plan/limits.js';
import PlannerController from '../plan/controller.js';
import PlannerPhase from '../phase.js';
import PlannerPicker from '../plan/picker.js';
import { applyingIds } from '../plan/state.js';
import RequestController from '../requests/controller.js';
import RequestPicker from '../requests/picker.js';

/** The tab. */
export default class PlannerTab {
  /**
   * The tab's part id on the sheet.
   * @type {string}
   */
  static get partId() {
    return PART_ID;
  }

  /**
   * The plan's targets grouped by section (attributes, body skills, combat techniques, ...), each
   * with its icon and its steps marked for affordability and maximum. Sections come in the order
   * their first target was planned.
   * @param {Actor} actor
   * @returns {object[]} The sections, each with its groups and total cost.
   */
  static buildSections(actor) {
    const sections = new Map();

    for (const group of PlannerData.getGroups(actor).values()) {
      group.icon = PlannerController.iconFor(actor, group.type, group.key);
      PlannerController.markAffordability(actor, group.steps);
      // Steps above the rule maximum get a hint, see PlannerLimits - group.limit is the worst one.
      group.limit = PlannerLimits.mark(actor, group.type, group.key, group.steps);

      const section = PlannerController.sectionFor(actor, group.type, group.key);
      if (!sections.has(section.id)) sections.set(section.id, { ...section, groups: [], totalCost: 0 });

      const s = sections.get(section.id);
      s.groups.push(group);
      s.totalCost += group.totalCost;
    }

    return Array.from(sections.values());
  }

  /**
   * Adds the tab's data to the sheet's render context, all prefixed with `planner`.
   * @param {ActorSheet} sheet
   * @param {object} context
   * @returns {Promise<object>}
   */
  static async prepareContext(sheet, context) {
    const actor = sheet.actor;

    context.plannerSections = this.buildSections(actor);
    // Outside the advancement phase players can plan, but not apply or ask - the GM sees the hint
    // too, just as information.
    context.plannerPhaseLocked = PlannerPhase.locked;
    context.plannerPhaseHint =
      PlannerPhase.enabled && !PlannerPhase.open
        ? game.i18n.localize(game.user.isGM ? 'STEIGERUNGSPLANER.Phase.HintGM' : 'STEIGERUNGSPLANER.Phase.Hint')
        : '';
    const phaseLockedText = game.i18n.localize('STEIGERUNGSPLANER.Phase.Locked');
    context.plannerAvailableXP = PlannerController.availableXP(actor);

    // Each one is weighed against the available AP on its own, like each target's steps are.
    // Sorted by group, then by name - so an extension ("Axxeleratus - Noch schneller") ends up right
    // below its spell, whenever it was planned.
    context.plannerRequests = PlannerData.getRequests(actor).map((request) => {
      const cost = RequestController.requestCost(actor, request);
      const levels = RequestController.requestLevels(actor, request)?.map((level) => ({
        ...level,
        label: this.romanNumeral(level.value),
        clickable: !level.owned && request.status === 'planned',
        tooltip: this.levelTooltip(level, request.level),
      }));
      const fw = RequestController.requestFW(request);
      const extension = RequestController.extensionState(actor, request);
      return {
        ...request,
        levels,
        fw: fw && {
          ...fw,
          // Shown next to the field only once something is planned on top of learning it.
          hint: fw.target > fw.start ? (fw.stepsCost === null ? '+? AP' : `+${fw.stepsCost} AP`) : '',
          tooltip: game.i18n.format('STEIGERUNGSPLANER.TargetFW.Tooltip', {
            learn: cost ?? '?',
            fw: fw.target,
            steps: fw.stepsCost ?? '?',
          }),
        },
        label: RequestController.label(request),
        levelLabel: request.level ? this.romanNumeral(request.level) : '',
        requested: request.status === 'requested',
        rejectedReason: request.rejected?.reason || game.i18n.localize('STEIGERUNGSPLANER.Request.RejectedNoReason'),
        // An extension can only be asked for once its spell/liturgy is there with a high enough FW.
        blockedReason: context.plannerPhaseLocked
          ? phaseLockedText
          : extension && extension.state !== 'ready'
            ? this.extensionBlockedReason(extension)
            : '',
        extensionMissing: extension?.state === 'missing',
        cost,
        costUnknown: cost === null,
        unaffordable: cost !== null && cost > context.plannerAvailableXP,
      };
    });
    context.plannerRequests.sort(
      (a, b) => RequestController.listGroup(a) - RequestController.listGroup(b) || a.label.localeCompare(b.label, game.i18n.lang),
    );

    context.plannerTotalCost = RequestController.plannedCost(actor);
    // The GM doesn't ask themselves - they get a check mark that buys the request right away.
    context.plannerIsGM = game.user.isGM;
    context.plannerEmpty = !context.plannerSections.length && !context.plannerRequests.length;
    return context;
  }

  /**
   * The tooltip of an extension's blocked send button.
   * @param {{state: string, source: string, requiredFW: number, currentFW: ?number}} extension
   *   From RequestController.extensionState.
   * @returns {string}
   */
  static extensionBlockedReason({ state, source, requiredFW, currentFW }) {
    const data = { source, required: requiredFW, current: currentFW };
    if (state === 'missing') return game.i18n.format('STEIGERUNGSPLANER.Extension.SourceMissing', data);
    if (state === 'notLearned') return game.i18n.format('STEIGERUNGSPLANER.Extension.SourceNotLearned', data);
    return game.i18n.format('STEIGERUNGSPLANER.Extension.FWTooLow', data);
  }

  /**
   * A level button's tooltip: how the planned cost changes when picking that level.
   * @param {{value: number, owned: boolean, delta: ?number}} level
   * @param {number} planned   The level planned now.
   * @returns {string}
   */
  static levelTooltip(level, planned) {
    if (level.owned) return game.i18n.localize('STEIGERUNGSPLANER.Level.Owned');
    if (level.value === planned) return game.i18n.localize('STEIGERUNGSPLANER.Level.Planned');
    if (level.delta === null) return game.i18n.localize('STEIGERUNGSPLANER.Cost.Unknown');
    return `${level.delta > 0 ? '+' : ''}${level.delta} AP`;
  }

  /**
   * A level as a roman numeral, the way the sheet writes them ("Reich II").
   * @param {number} value
   * @returns {string}
   */
  static romanNumeral(value) {
    const numerals = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let result = '';
    for (const [n, numeral] of numerals) {
      while (value >= n) {
        result += numeral;
        value -= n;
      }
    }
    return result;
  }

  /**
   * Moves the tab into the sheet's tab container, next to the notes part. The sheet's root template
   * only has placeholders for the system's own parts, so Foundry appends ours at the end of the
   * whole sheet. A no-op if it's in place already.
   * @param {ActorSheet} sheet
   * @param {HTMLElement} element   The tab.
   */
  static relocate(sheet, element) {
    const notes = sheet.element.querySelector('[data-application-part="notes"]');
    if (!notes?.parentElement) return;
    notes.parentElement.insertBefore(element, notes.nextSibling);
  }

  /**
   * Folds the tiles or rows away in red, all at once, then runs `action` and re-renders. For the
   * trash icon (all of a row's tiles), the X (a tile and the ones after it) and discarding a request.
   * @param {ActorSheet} sheet
   * @param {HTMLElement} element   The tab - no clicks while it folds.
   * @param {HTMLElement[]} tiles
   * @param {function(): Promise} action
   */
  static foldThenRun(sheet, element, tiles, action) {
    if (!tiles.length) return;

    element.style.pointerEvents = 'none';

    tiles[tiles.length - 1].addEventListener('transitionend', () => {
      action().then(() => sheet.render());
    }, { once: true });

    tiles.forEach((el) => el.classList.add('planner-step-cancelling'));
  }

  /**
   * Moves the tab into place and wires its buttons, fields and tiles. Called on every render of the
   * part.
   * @param {ActorSheet} sheet
   * @param {HTMLElement} element   The tab.
   */
  static attachListeners(sheet, element) {
    this.relocate(sheet, element);

    // Apply: the first step folds away in green, then the system applies it.
    element.querySelectorAll('[data-plan-apply]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (PlannerPhase.locked) return PlannerPhase.warn();
        const firstStepEl = ev.currentTarget.parentElement.querySelector('.planner-steps .planner-step:first-child');

        if (!firstStepEl) return;

        const { type, key } = ev.currentTarget.dataset;
        const plan = PlannerData.getPlan(sheet.actor);
        const idx = PlannerData.firstIndex(plan, type, key);
        const entry = idx === -1 ? null : plan[idx];
        if (!entry) return;

        if (entry.cost > 0 && PlannerController.availableXP(sheet.actor) < entry.cost) {
          ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.Plan.NotEnoughXP', { label: entry.label }));
          return;
        }

        element.style.pointerEvents = 'none';

        firstStepEl.addEventListener('transitionend', () => {
          applyingIds.add(entry.id);
          PlannerController.applyFirst(sheet, type, key).finally(() => {
            applyingIds.delete(entry.id);
          });
        }, { once: true });

        firstStepEl.classList.add('planner-step-applying');
      });
    });

    element.querySelector('[data-plan-add-target]')?.addEventListener('click', (ev) => PlannerPicker.open(sheet, ev));
    element.querySelector('[data-plan-add-request]')?.addEventListener('click', () => RequestPicker.open(sheet.actor));

    element.querySelectorAll('[data-request-send]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        await RequestController.markRequested(sheet.actor, ev.currentTarget.dataset.id);
        sheet.render();
      });
    });

    element.querySelectorAll('[data-request-withdraw]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        await RequestController.withdrawRequest(sheet.actor, ev.currentTarget.dataset.id);
        sheet.render();
      });
    });

    // The GM's check mark and gift: buy right away, the gift without AP cost.
    for (const [selector, gift] of [['[data-request-approve]', false], ['[data-request-gift]', true]]) {
      element.querySelectorAll(selector).forEach((el) => {
        el.addEventListener('click', async (ev) => {
          const target = ev.currentTarget;
          target.style.pointerEvents = 'none';
          await RequestController.approveRequest(sheet.actor, target.dataset.id, { gift });
          sheet.render();
        });
      });
    }

    // The wanted FW of a spell/liturgy request. Handled on the field itself so the change doesn't
    // reach the sheet's form, Enter just commits the value instead of submitting the form.
    element.querySelectorAll('[data-request-fw]').forEach((el) => {
      el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        ev.currentTarget.blur();
      });
      el.addEventListener('change', async (ev) => {
        ev.stopPropagation();
        const { id } = ev.currentTarget.dataset;
        await RequestController.setTargetFW(sheet.actor, id, Number(ev.currentTarget.value));
        sheet.render();
      });
    });

    element.querySelectorAll('[data-request-level]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        const { id, requestLevel } = ev.currentTarget.dataset;
        await RequestController.setLevel(sheet.actor, id, Number(requestLevel));
        sheet.render();
      });
    });

    element.querySelectorAll('[data-request-remove]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const { id } = ev.currentTarget.dataset;
        const row = ev.currentTarget.closest('.planner-request');
        this.foldThenRun(sheet, element, [row], () => RequestController.removeRequest(sheet.actor, id));
      });
    });

    element.querySelectorAll('[data-plan-add]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        const { type, key } = ev.currentTarget.dataset;
        await PlannerController.appendStep(sheet.actor, type, key);
        sheet.render();
      });
    });

    // The trash icon of a row: all of its steps, after asking.
    element.querySelectorAll('[data-plan-cancel]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        const { type, key } = ev.currentTarget.dataset;
        const stepEls = Array.from(ev.currentTarget.parentElement.querySelectorAll('.planner-steps .planner-step'));
        if (!stepEls.length) return;

        const group = PlannerData.getGroups(sheet.actor).get(`${type}:${key}`);
        if (!group) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('STEIGERUNGSPLANER.Plan.DiscardAll') },
          content: game.i18n.format('STEIGERUNGSPLANER.Plan.ConfirmDiscardAll', { count: group.steps.length, label: group.label }),
          rejectClose: false,
          modal: true,
        });
        if (!confirmed) return;

        this.foldThenRun(sheet, element, stepEls, () => PlannerController.discardQueue(sheet.actor, type, key, { silent: true }));
      });
    });

    // A click on a tile (not its X) applies the steps up to it - as many of them as are affordable,
    // read from the same .planner-step-unaffordable the hover preview uses, so the click does
    // exactly what the preview showed.
    element.querySelectorAll('.planner-step-inner').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (PlannerPhase.locked) return PlannerPhase.warn();
        const stepEl = ev.currentTarget.closest('.planner-step');
        if (!stepEl) return;

        const { type, key } = ev.currentTarget.dataset;
        const group = PlannerData.getGroups(sheet.actor).get(`${type}:${key}`);
        if (!group) return;

        const siblings = Array.from(stepEl.parentElement.children);
        const affordableCount = siblings.filter((s) => !s.classList.contains('planner-step-unaffordable')).length;
        const count = Math.min(siblings.indexOf(stepEl) + 1, affordableCount);

        if (count <= 0) {
          ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.Plan.NotEnoughXP', { label: group.label }));
          return;
        }

        const tiles = siblings.slice(0, count);
        const entryIds = group.steps.slice(0, count).map((e) => e.id);

        element.style.pointerEvents = 'none';

        tiles[tiles.length - 1].addEventListener('transitionend', () => {
          entryIds.forEach((id) => applyingIds.add(id));
          PlannerController.applyUpTo(sheet, type, key, count).finally(() => {
            entryIds.forEach((id) => applyingIds.delete(id));
          });
        }, { once: true });

        tiles.forEach((t) => t.classList.add('planner-step-applying'));
      });
    });

    // The X on a tile: that step and the ones after it.
    element.querySelectorAll('.planner-step-remove').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();

        const stepEl = ev.currentTarget.closest('.planner-step');
        if (!stepEl) return;

        const siblings = Array.from(stepEl.parentElement.children);
        const tiles = siblings.slice(siblings.indexOf(stepEl));

        const { type, key, id } = ev.currentTarget.dataset;
        this.foldThenRun(sheet, element, tiles, () => PlannerController.cancelFrom(sheet.actor, type, key, id));
      });
    });
  }
}
