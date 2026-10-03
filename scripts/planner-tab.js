import { PART_ID } from './module-config.js';
import PlannerData from './planner-data.js';
import PlannerController from './planner-controller.js';
import PlannerPicker from './planner-picker.js';
import { applyingIds } from './planner-state.js';
import RequestController from './request-controller.js';
import RequestPicker from './request-picker.js';

export default class PlannerTab {
  static get partId() {
    return PART_ID;
  }

  // Groups target-groups (one per attribute/point/item, from PlannerData.getGroups) a second
  // time by display section (Körpertalente, Kampftechniken, Eigenschaften, ...) for the tab's
  // layout. Sections appear in the order their first member was first encountered.
  static buildSections(actor) {
    const sections = new Map();

    for (const group of PlannerData.getGroups(actor).values()) {
      group.icon = PlannerController.iconFor(actor, group.type, group.key);
      PlannerController.markAffordability(actor, group.steps);

      const section = PlannerController.sectionFor(actor, group.type, group.key);
      if (!sections.has(section.id)) sections.set(section.id, { ...section, groups: [], totalCost: 0 });

      const s = sections.get(section.id);
      s.groups.push(group);
      s.totalCost += group.totalCost;
    }

    return Array.from(sections.values());
  }

  static async prepareContext(sheet, context) {
    const actor = sheet.actor;

    context.plannerSections = this.buildSections(actor);
    context.plannerAvailableXP = PlannerController.availableXP(actor);

    // Each one is weighed against the available AP on its own, like each target's steps are.
    context.plannerRequests = PlannerData.getRequests(actor).map((request) => {
      const cost = RequestController.requestCost(actor, request);
      const levels = RequestController.requestLevels(actor, request)?.map((level) => ({
        ...level,
        label: this.romanNumeral(level.value),
        clickable: !level.owned && request.status === 'planned',
        tooltip: this.levelTooltip(level, request.level),
      }));
      return {
        ...request,
        levels,
        label: RequestController.label(request),
        requested: request.status === 'requested',
        rejectedReason: request.rejected?.reason || game.i18n.localize('STEIGERUNGSPLANER.RequestRejectedNoReason'),
        cost,
        costUnknown: cost === null,
        unaffordable: cost !== null && cost > context.plannerAvailableXP,
      };
    });

    // Requests count into the planned cost until the GM approves them - then the system charges them.
    const requestCost = context.plannerRequests.reduce((sum, r) => sum + (r.cost ?? 0), 0);
    context.plannerTotalCost = context.plannerSections.reduce((sum, s) => sum + s.totalCost, 0) + requestCost;
    // The GM doesn't ask themselves - they get a check mark that buys the request right away.
    context.plannerIsGM = game.user.isGM;
    context.plannerEmpty =!context.plannerSections.length && !context.plannerRequests.length;
    return context;
  }

  // A level button's tooltip: how the planned cost changes when picking that level.
  static levelTooltip(level, planned) {
    if (level.owned) return game.i18n.localize('STEIGERUNGSPLANER.LevelOwned');
    if (level.value === planned) return game.i18n.localize('STEIGERUNGSPLANER.LevelPlanned');
    if (level.delta === null) return game.i18n.localize('STEIGERUNGSPLANER.CostUnknown');
    return `${level.delta > 0 ? '+' : ''}${level.delta} AP`;
  }

  // Levels are written as roman numerals on the sheet ("Reich II"), so the level buttons are too.
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

  // sheet.hbs (the root part template) hardcodes a <template data-application-part="X">
  // placeholder for every part it knows about - ours isn't one of them, so Foundry's fallback
  // appends our rendered element to the end of the whole sheet instead of into the actual
  // tab-content container. Move it next to the "notes" part, which is guaranteed to exist and
  // sits in that same container. Safe to call on every render: if already in place, this is a
  // no-op (inserting a node immediately after its own current position doesn't move anything).
  static relocate(sheet, element) {
    const notes = sheet.element.querySelector('[data-application-part="notes"]');
    if (!notes?.parentElement) return;
    notes.parentElement.insertBefore(element, notes.nextSibling);
  }

  // Adds .planner-step-cancelling to every tile in `tiles` simultaneously (they share the same
  // transition duration, so one fold plays instead of N sequential ones), then runs `action` once
  // the last tile's fold finishes and re-renders. Shared by the trash icon (all of a group's
  // tiles) and the per-step X (a tile and everything queued after it).
  static foldThenRun(sheet, element, tiles, action) {
    if (!tiles.length) return;

    element.style.pointerEvents = 'none';

    tiles[tiles.length - 1].addEventListener('transitionend', () => {
      action().then(() => sheet.render());
    }, { once: true });

    tiles.forEach((el) => el.classList.add('planner-step-cancelling'));
  }

  static attachListeners(sheet, element) {
    this.relocate(sheet, element);

    element.querySelectorAll('[data-plan-apply]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const firstStepEl = ev.currentTarget.parentElement.querySelector('.planner-steps .planner-step:first-child');

        if (!firstStepEl) return;

        const { type, key } = ev.currentTarget.dataset;
        const plan = PlannerData.getPlan(sheet.actor);
        const idx = PlannerData.firstIndex(plan, type, key);
        const entry = idx === -1 ? null : plan[idx];
        if (!entry) return;

        if (entry.cost > 0 && PlannerController.availableXP(sheet.actor) < entry.cost) {
          ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.NotEnoughXP', { label: entry.label }));
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

    element.querySelectorAll('[data-request-approve]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        const target = ev.currentTarget;
        target.style.pointerEvents = 'none';
        await RequestController.approveRequest(sheet.actor, target.dataset.id);
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

    element.querySelectorAll('[data-plan-cancel]').forEach((el) => {
      el.addEventListener('click', async (ev) => {
        const { type, key } = ev.currentTarget.dataset;
        const stepEls = Array.from(ev.currentTarget.parentElement.querySelectorAll('.planner-steps .planner-step'));
        if (!stepEls.length) return;

        const group = PlannerData.getGroups(sheet.actor).get(`${type}:${key}`);
        if (!group) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('STEIGERUNGSPLANER.Cancel') },
          content: game.i18n.format('STEIGERUNGSPLANER.ConfirmDiscardAll', { count: group.steps.length, label: group.label }),
          rejectClose: false,
          modal: true,
        });
        if (!confirmed) return;

        this.foldThenRun(sheet, element, stepEls, () => PlannerController.discardQueue(sheet.actor, type, key, { silent: true }));
      });
    });

    // Buying multiple steps in one click: click a step's own content (not the X, which stops
    // propagation before this ever fires) to buy the front of the queue through that step. Capped
    // by how many are currently affordable - the same .planner-step-unaffordable marking the CSS
    // preview already respects, read straight back out of the DOM rather than recomputed, so what
    // you saw highlighted on hover is exactly what happens on click.
    element.querySelectorAll('.planner-step-inner').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const stepEl = ev.currentTarget.closest('.planner-step');
        if (!stepEl) return;

        const { type, key } = ev.currentTarget.dataset;
        const group = PlannerData.getGroups(sheet.actor).get(`${type}:${key}`);
        if (!group) return;

        const siblings = Array.from(stepEl.parentElement.children);
        const affordableCount = siblings.filter((s) => !s.classList.contains('planner-step-unaffordable')).length;
        const count = Math.min(siblings.indexOf(stepEl) + 1, affordableCount);

        if (count <= 0) {
          ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.NotEnoughXP', { label: group.label }));
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
