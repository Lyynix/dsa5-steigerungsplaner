/**
 * @file The GM's overview: what every player character has planned, with their open requests on
 * top to approve, gift or reject, and the advancement phase switch. It opens by itself on login when
 * there's something to decide and whenever a player asks for something - then filtered to open
 * requests, and closing again once they're done. Opened with the button in the actors directory, it
 * shows everything and stays open. Also tells players when the GM decided on one of their requests.
 */

import { FLAG_REQUESTS, MODULE_ID, PART_ID } from './config.js';
import PlannerController from './plan/controller.js';
import PlannerData from './plan/data.js';
import PlannerPhase from './phase.js';
import PlannerTab from './sheet/tab.js';
import RequestController from './requests/controller.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The plan's sections in a fixed order (the planner tab lists them as they were first planned), see
 * PlannerController.sectionFor. Anything else goes after them.
 */
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

/** The overview window. There's only one. */
export default class PlannerOverview extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'steigerungsplaner-overview',
    classes: ['steigerungsplaner-overview'],
    position: { width: 640, height: 'auto' },
    window: { title: 'STEIGERUNGSPLANER.Overview.Title', icon: 'fas fa-list-check', resizable: true },
    actions: {
      approve: PlannerOverview.#onApprove,
      gift: PlannerOverview.#onGift,
      reject: PlannerOverview.#onReject,
      openSheet: PlannerOverview.#onOpenSheet,
      toggleActor: PlannerOverview.#onToggleActor,
      togglePhase: PlannerOverview.#onTogglePhase,
    },
  };

  static PARTS = {
    list: { template: `modules/${MODULE_ID}/templates/planner-overview.hbs` },
  };

  /**
   * The window, if one was created.
   * @type {?PlannerOverview}
   */
  static get instance() {
    return foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
  }

  /**
   * Opens the window, or brings it to the front.
   * @param {object} [options]
   * @param {boolean} [options.auto=false]   Opened by itself because of open requests: filtered to
   *   them, and closing once they're done. An already open window isn't switched to that mode - the
   *   GM is looking at it already.
   * @returns {Promise<PlannerOverview>}
   */
  static open({ auto = false } = {}) {
    let app = this.instance;
    if (!app?.rendered) {
      app ??= new PlannerOverview();
      app.#auto = auto;
      app.#onlyOpen = auto;
    } else if (!auto) {
      app.#auto = false;
    }
    return app.render({ force: true });
  }

  /**
   * Re-renders the open window after a change somewhere - or closes it, if it opened by itself and
   * nothing is left to decide.
   */
  static refresh() {
    const app = this.instance;
    if (!app?.rendered) return;
    if (app.#auto && !this.#hasOpenRequests()) app.close();
    else app.#renderSoon();
  }

  /**
   * Whether any character has a request waiting for the GM.
   * @returns {boolean}
   */
  static #hasOpenRequests() {
    return game.actors.some((actor) => PlannerData.getRequests(actor).some((r) => r.status === 'requested'));
  }

  /**
   * Characters some player owns - the GM's own and NPCs aren't anyone's plans.
   * @returns {Actor[]}
   */
  static #playerCharacters() {
    const players = game.users.filter((user) => !user.isGM);
    return game.actors.filter((actor) => actor.type === 'character' && players.some((user) => actor.testUserPermission(user, 'OWNER')));
  }

  /**
   * Registers the hooks. For the GM: open on login if something's waiting, tell them about new
   * requests, keep the window up to date, and the button in the actors directory. For players: tell
   * them when the GM decided on one of theirs. Called once on ready.
   */
  static register() {
    const known = new Map(game.actors.map((actor) => [actor.id, this.#snapshot(actor)]));

    Hooks.on('updateActor', (actor, changes, options, userId) => {
      if (game.user.isGM) this.refresh();
      if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG_REQUESTS}`)) return;

      const before = known.get(actor.id) ?? new Map();
      const after = this.#snapshot(actor);
      known.set(actor.id, after);

      if (game.user.isGM) {
        if (userId === game.user.id) return;
        const asked = [...after.values()].filter((r) => r.status === 'requested' && before.get(r.id)?.status !== 'requested');
        if (!asked.length) return;
        for (const request of asked) {
          ui.notifications.info(game.i18n.format('STEIGERUNGSPLANER.Approval.New', { actor: actor.name, name: RequestController.label(request) }));
        }
        this.open({ auto: true });
      } else if (actor.isOwner && userId !== game.user.id) {
        for (const request of before.values()) {
          const now = after.get(request.id);
          const name = RequestController.label(request);
          // A gift is marked 'gifted' right before it goes - also one the player hadn't sent yet.
          if (now?.status === 'gifted' && request.status !== 'gifted') {
            ui.notifications.info(game.i18n.format('STEIGERUNGSPLANER.Request.Notify.Gifted', { name }));
            continue;
          }
          if (request.status !== 'requested') continue;
          if (!now) ui.notifications.info(game.i18n.format('STEIGERUNGSPLANER.Request.Notify.Approved', { name }));
          else if (now.rejected) ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.Request.Notify.Rejected', { name }));
        }
      }
    });

    if (!game.user.isGM) return;

    // Values change on the items too (talents, spells), and an item can get bought or deleted.
    for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
      Hooks.on(hook, (item) => {
        if (item.actor) this.refresh();
      });
    }

    Hooks.on('renderActorDirectory', (app, html) => {
      const root = html instanceof HTMLElement ? html : html[0];
      const actions = root?.querySelector('.header-actions');
      if (!actions || actions.querySelector('.steigerungsplaner-overview-button')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'steigerungsplaner-overview-button';
      button.innerHTML = `<i class="fas fa-list-check"></i> ${game.i18n.localize('STEIGERUNGSPLANER.Overview.Button')}`;
      button.addEventListener('click', () => this.open());
      actions.append(button);
    });
    ui.actors?.render();

    if (this.#hasOpenRequests()) this.open({ auto: true });
  }

  /**
   * The actor's requests by id, to compare against after an update.
   * @param {Actor} actor
   * @returns {Map<string, Request>}
   */
  static #snapshot(actor) {
    return new Map(PlannerData.getRequests(actor).map((r) => [r.id, r]));
  }

  /** Opened by itself (see open) - only then it also closes by itself. */
  #auto = false;
  /** Filtered to open requests. */
  #onlyOpen = false;
  /**
   * Ids of the collapsed characters.
   * @type {Set<string>}
   */
  #collapsed = new Set();
  /**
   * Compendium items loaded so far, by uuid.
   * @type {Map<string, Item>}
   */
  #documents = new Map();
  /** Several updates arrive at once while something is bought or applied - one render for all. */
  #renderSoon = foundry.utils.debounce(() => {
    if (this.rendered) this.render();
  }, 100);

  /**
   * The full item from its compendium, loaded once per window - for a request's requirements.
   * @param {string} uuid
   * @returns {Promise<?Item>}
   */
  async #document(uuid) {
    if (!this.#documents.has(uuid)) this.#documents.set(uuid, await fromUuid(uuid));
    return this.#documents.get(uuid);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const enrich = (text) => foundry.applications.ux.TextEditor.implementation.enrichHTML(text);

    const actors = [];
    for (const actor of PlannerOverview.#playerCharacters()) {
      const requests = PlannerData.getRequests(actor);
      const open = requests.filter((r) => r.status === 'requested');
      const groups = [...PlannerData.getGroups(actor).values()];
      if (this.#onlyOpen ? !open.length : !open.length && !groups.length && !requests.length) continue;

      const openRequests = [];
      for (const request of open) {
        const doc = await this.#document(request.uuid);
        const cost = RequestController.requestCost(actor, request);
        openRequests.push({
          id: request.id,
          img: request.img,
          // A link to the item in its compendium, so the GM can read it up.
          link: await enrich(`@UUID[${request.uuid}]{${RequestController.label(request)}}`),
          level: request.level ? PlannerTab.romanNumeral(request.level) : null,
          cost,
          costUnknown: cost === null,
          requirements: doc?.system.requirements?.value ?? '',
        });
      }

      // The plan in the planner tab's sections: queued steps per target as start → end, sorted by
      // name. Then what's planned to be requested from the catalog, sorted like in the tab - here
      // the GM does see a spell's wanted FW, approving only leaves it out.
      const order = (id) => (SECTION_ORDER.includes(id) ? SECTION_ORDER.indexOf(id) : SECTION_ORDER.length);
      const sections = PlannerTab.buildSections(actor)
        .sort((a, b) => order(a.id) - order(b.id))
        .map((section) => ({
          label: section.label,
          cssClass: section.cssClass,
          entries: section.groups
            .map((group) => ({
              img: group.icon,
              label: group.label,
              detail: `${group.steps[0].from} » ${group.steps[group.steps.length - 1].to}`,
              cost: `${group.totalCost} AP`,
              limit: group.limit,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)),
        }));

      const catalog = [];
      const notRequested = requests
        .filter((r) => r.status !== 'requested')
        .map((request) => ({ request, label: RequestController.label(request) }))
        .sort((a, b) => RequestController.listGroup(a.request) - RequestController.listGroup(b.request) || a.label.localeCompare(b.label, game.i18n.lang));
      for (const { request, label } of notRequested) {
        const cost = RequestController.requestCost(actor, request);
        const fw = RequestController.requestFW(request);
        const steps = fw && fw.target > fw.start ? fw.stepsCost : null;
        const details = [];
        // Written like on the sheet: "Adel III".
        if (request.level) details.push(PlannerTab.romanNumeral(request.level));
        if (steps !== null) details.push(`${game.i18n.localize('STEIGERUNGSPLANER.TargetFW.Label')} ${fw.target}`);
        catalog.push({
          img: request.img,
          label,
          detail: details.join(' · '),
          rejected: !!request.rejected,
          cost: steps !== null ? `${cost ?? '?'} + ${steps} AP` : `${cost ?? '?'} AP`,
        });
      }
      // First, like the requests section on top of the planner tab.
      if (catalog.length) {
        sections.unshift({ label: game.i18n.localize('STEIGERUNGSPLANER.Catalog.Title'), cssClass: 'steigerungsplaner-section-requests', entries: catalog });
      }

      const free = PlannerController.availableXP(actor);
      const plannedCost = RequestController.plannedCost(actor);

      actors.push({
        id: actor.id,
        name: actor.name,
        img: actor.img || CONST.DEFAULT_TOKEN,
        // Two parts, so the planned one alone can turn red: more planned than there's AP for yet -
        // nothing wrong, but worth seeing at a glance.
        free: game.i18n.format('STEIGERUNGSPLANER.Summary.Free', { free }),
        planned: game.i18n.format('STEIGERUNGSPLANER.Summary.Planned', { planned: plannedCost }),
        overBudget: plannedCost > free,
        collapsed: this.#collapsed.has(actor.id),
        openRequests,
        sections: this.#onlyOpen ? [] : sections,
      });
    }

    // Whoever is waiting for the GM first.
    actors.sort((a, b) => !!b.openRequests.length - !!a.openRequests.length || a.name.localeCompare(b.name, game.i18n.lang));
    context.actors = actors;
    context.onlyOpen = this.#onlyOpen;
    // The advancement phase switch, only once the phase is switched on in the settings.
    context.phase = PlannerPhase.enabled ? { open: PlannerPhase.open } : null;
    context.empty = game.i18n.localize(this.#onlyOpen ? 'STEIGERUNGSPLANER.Approval.Empty' : 'STEIGERUNGSPLANER.Overview.Empty');
    return context;
  }

  /**
   * Wires the "open requests only" filter.
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Switching the filter by hand means the GM is looking at the window - it stays open then.
    this.element.querySelector('[data-only-open]')?.addEventListener('change', (ev) => {
      this.#onlyOpen = ev.currentTarget.checked;
      this.#auto = false;
      this.render();
    });
  }

  /**
   * The character a clicked element belongs to.
   * @param {HTMLElement} target
   * @returns {?Actor}
   */
  static #actorFor(target) {
    return game.actors.get(target.closest('[data-actor-id]')?.dataset.actorId);
  }

  /**
   * Approves a request: buys it for the character.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @returns {Promise<void>}
   */
  static async #onApprove(event, target) {
    const actor = PlannerOverview.#actorFor(target);
    if (!actor) return;
    target.disabled = true;
    await RequestController.approveRequest(actor, target.closest('[data-request-id]').dataset.requestId);
    PlannerOverview.refresh();
  }

  /**
   * Gifts a request: buys it without AP cost.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @returns {Promise<void>}
   */
  static async #onGift(event, target) {
    const actor = PlannerOverview.#actorFor(target);
    if (!actor) return;
    target.disabled = true;
    await RequestController.approveRequest(actor, target.closest('[data-request-id]').dataset.requestId, { gift: true });
    PlannerOverview.refresh();
  }

  /**
   * Rejects a request, asking for an optional reason.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @returns {Promise<void>}
   */
  static async #onReject(event, target) {
    const actor = PlannerOverview.#actorFor(target);
    const id = target.closest('[data-request-id]')?.dataset.requestId;
    const request = actor && PlannerData.getRequests(actor).find((r) => r.id === id);
    if (!request) return;

    const name = Handlebars.escapeExpression(RequestController.label(request));
    const reason = await foundry.applications.api.DialogV2.prompt({
      window: { title: 'STEIGERUNGSPLANER.Approval.RejectTitle' },
      content: `<p>${game.i18n.format('STEIGERUNGSPLANER.Approval.RejectPrompt', { name, actor: Handlebars.escapeExpression(actor.name) })}</p>
        <input type="text" name="reason" placeholder="${game.i18n.localize('STEIGERUNGSPLANER.Approval.RejectReason')}" autofocus>`,
      ok: {
        label: 'STEIGERUNGSPLANER.Approval.Reject',
        icon: 'fas fa-ban',
        callback: (event, button) => button.form.elements.reason.value.trim(),
      },
      rejectClose: false,
    });
    if (reason === null || reason === undefined) return;

    await RequestController.rejectRequest(actor, id, reason);
    PlannerOverview.refresh();
  }

  /**
   * Opens the character's sheet straight on the planner tab - that's what the GM wants to look at
   * from here.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @returns {Promise<void>}
   */
  static async #onOpenSheet(event, target) {
    const sheet = PlannerOverview.#actorFor(target)?.sheet;
    if (!sheet) return;
    await sheet.render({ force: true });
    sheet.changeTab?.(PART_ID, 'sheet');
  }

  /**
   * Opens or closes the advancement phase - the same world setting as in the module settings, its
   * onChange re-renders and tells the players.
   * @returns {Promise<void>}
   */
  static async #onTogglePhase() {
    await PlannerPhase.setOpen(!PlannerPhase.open);
  }

  /**
   * Collapses or expands a character.
   * @this {PlannerOverview}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onToggleActor(event, target) {
    const id = target.closest('[data-actor-id]')?.dataset.actorId;
    if (!id) return;
    if (this.#collapsed.has(id)) this.#collapsed.delete(id);
    else this.#collapsed.add(id);
    this.render();
  }
}
