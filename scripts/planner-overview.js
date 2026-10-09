import { FLAG_REQUESTS, MODULE_ID, PART_ID } from './module-config.js';
import PlannerController from './planner-controller.js';
import PlannerData from './planner-data.js';
import RequestController from './request-controller.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// The GM's window: what every player character has planned, with their open requests on top to
// approve or reject. It opens by itself on login when there's something to decide and whenever a
// player asks for something - then filtered to open requests, and closing again once they're done.
// Opened via the button in the actors directory it shows everything and stays open.
export default class PlannerOverview extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'steigerungsplaner-overview',
    classes: ['steigerungsplaner-overview'],
    position: { width: 600, height: 'auto' },
    window: { title: 'STEIGERUNGSPLANER.OverviewTitle', icon: 'fas fa-list-check', resizable: true },
    actions: {
      approve: PlannerOverview.#onApprove,
      reject: PlannerOverview.#onReject,
      openSheet: PlannerOverview.#onOpenSheet,
      toggleActor: PlannerOverview.#onToggleActor,
    },
  };

  static PARTS = {
    list: { template: `modules/${MODULE_ID}/templates/planner-overview.hbs` },
  };

  static get instance() {
    return foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
  }

  // `auto`: opened by itself because of open requests. An already open window isn't switched to
  // that mode - the GM is looking at it already.
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

  // Re-renders the open window after a change somewhere - or closes it, if it opened by itself and
  // nothing is left to decide.
  static refresh() {
    const app = this.instance;
    if (!app?.rendered) return;
    if (app.#auto && !this.#hasOpenRequests()) app.close();
    else app.#renderSoon();
  }

  static #hasOpenRequests() {
    return game.actors.some((actor) => PlannerData.getRequests(actor).some((r) => r.status === 'requested'));
  }

  // Characters some player owns - the GM's own and NPCs aren't anyone's plans.
  static #playerCharacters() {
    const players = game.users.filter((user) => !user.isGM);
    return game.actors.filter((actor) => actor.type === 'character' && players.some((user) => actor.testUserPermission(user, 'OWNER')));
  }

  // Hooks for the GM: open on login if something's waiting, tell them about new requests, keep the
  // window up to date, and a button in the actors directory. Players get told when the GM decided
  // on one of theirs.
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
          ui.notifications.info(game.i18n.format('STEIGERUNGSPLANER.ApprovalNew', { actor: actor.name, name: RequestController.label(request) }));
        }
        this.open({ auto: true });
      } else if (actor.isOwner && userId !== game.user.id) {
        for (const request of before.values()) {
          if (request.status !== 'requested') continue;
          const now = after.get(request.id);
          const name = RequestController.label(request);
          if (!now) ui.notifications.info(game.i18n.format('STEIGERUNGSPLANER.RequestApprovedInfo', { name }));
          else if (now.rejected) ui.notifications.warn(game.i18n.format('STEIGERUNGSPLANER.RequestRejectedInfo', { name }));
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
      button.innerHTML = `<i class="fas fa-list-check"></i> ${game.i18n.localize('STEIGERUNGSPLANER.OverviewButton')}`;
      button.addEventListener('click', () => this.open());
      actions.append(button);
    });
    ui.actors?.render();

    if (this.#hasOpenRequests()) this.open({ auto: true });
  }

  static #snapshot(actor) {
    return new Map(PlannerData.getRequests(actor).map((r) => [r.id, r]));
  }

  // Opened by itself (see open) - only then it also closes by itself.
  #auto = false;
  #onlyOpen = false;
  #collapsed = new Set();
  #documents = new Map();
  // Several updates arrive at once while something is bought or applied - one render for all.
  #renderSoon = foundry.utils.debounce(() => {
    if (this.rendered) this.render();
  }, 100);

  async #document(uuid) {
    if (!this.#documents.has(uuid)) this.#documents.set(uuid, await fromUuid(uuid));
    return this.#documents.get(uuid);
  }

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
          level: request.level,
          cost,
          costUnknown: cost === null,
          requirements: doc?.system.requirements?.value ?? '',
        });
      }

      // The plan: queued steps per target as start → end, then what's planned to be requested.
      // Here the GM does see a spell's wanted FW - approving only leaves it out.
      const planned = groups.map((group) => ({
        img: PlannerController.iconFor(actor, group.type, group.key),
        label: group.label,
        detail: `${group.steps[0].from} → ${group.steps[group.steps.length - 1].to}`,
        cost: `${group.totalCost} AP`,
      }));
      for (const request of requests.filter((r) => r.status !== 'requested')) {
        const cost = RequestController.requestCost(actor, request);
        const fw = RequestController.requestFW(request);
        const steps = fw && fw.target > fw.start ? fw.stepsCost : null;
        const details = [];
        if (request.level) details.push(game.i18n.format('STEIGERUNGSPLANER.RequestLevel', { level: request.level }));
        if (steps !== null) details.push(`${game.i18n.localize('STEIGERUNGSPLANER.TargetFW')} ${fw.target}`);
        planned.push({
          img: request.img,
          label: RequestController.label(request),
          detail: details.join(' · '),
          request: true,
          rejected: !!request.rejected,
          cost: steps !== null ? `${cost ?? '?'} + ${steps} AP` : `${cost ?? '?'} AP`,
        });
      }

      actors.push({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        summary: game.i18n.format('STEIGERUNGSPLANER.Summary', {
          free: PlannerController.availableXP(actor),
          planned: RequestController.plannedCost(actor),
        }),
        collapsed: this.#collapsed.has(actor.id),
        openRequests,
        planned: this.#onlyOpen ? [] : planned,
      });
    }

    // Whoever is waiting for the GM first.
    actors.sort((a, b) => !!b.openRequests.length - !!a.openRequests.length || a.name.localeCompare(b.name, game.i18n.lang));
    context.actors = actors;
    context.onlyOpen = this.#onlyOpen;
    context.empty = game.i18n.localize(this.#onlyOpen ? 'STEIGERUNGSPLANER.ApprovalEmpty' : 'STEIGERUNGSPLANER.OverviewEmpty');
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Switching the filter by hand means the GM is looking at the window - it stays open then.
    this.element.querySelector('[data-only-open]')?.addEventListener('change', (ev) => {
      this.#onlyOpen = ev.currentTarget.checked;
      this.#auto = false;
      this.render();
    });
  }

  static #actorFor(target) {
    return game.actors.get(target.closest('[data-actor-id]')?.dataset.actorId);
  }

  static async #onApprove(event, target) {
    const actor = PlannerOverview.#actorFor(target);
    if (!actor) return;
    target.disabled = true;
    await RequestController.approveRequest(actor, target.closest('[data-request-id]').dataset.requestId);
    PlannerOverview.refresh();
  }

  static async #onReject(event, target) {
    const actor = PlannerOverview.#actorFor(target);
    const id = target.closest('[data-request-id]')?.dataset.requestId;
    const request = actor && PlannerData.getRequests(actor).find((r) => r.id === id);
    if (!request) return;

    const name = Handlebars.escapeExpression(RequestController.label(request));
    const reason = await foundry.applications.api.DialogV2.prompt({
      window: { title: 'STEIGERUNGSPLANER.RejectTitle' },
      content: `<p>${game.i18n.format('STEIGERUNGSPLANER.RejectPrompt', { name, actor: Handlebars.escapeExpression(actor.name) })}</p>
        <input type="text" name="reason" placeholder="${game.i18n.localize('STEIGERUNGSPLANER.RejectReason')}" autofocus>`,
      ok: {
        label: 'STEIGERUNGSPLANER.Reject',
        icon: 'fas fa-ban',
        callback: (event, button) => button.form.elements.reason.value.trim(),
      },
      rejectClose: false,
    });
    if (reason === null || reason === undefined) return;

    await RequestController.rejectRequest(actor, id, reason);
    PlannerOverview.refresh();
  }

  // Straight to the planner tab, that's what the GM wants to look at from here.
  static async #onOpenSheet(event, target) {
    const sheet = PlannerOverview.#actorFor(target)?.sheet;
    if (!sheet) return;
    await sheet.render({ force: true });
    sheet.changeTab?.(PART_ID, 'sheet');
  }

  static #onToggleActor(event, target) {
    const id = target.closest('[data-actor-id]')?.dataset.actorId;
    if (!id) return;
    if (this.#collapsed.has(id)) this.#collapsed.delete(id);
    else this.#collapsed.add(id);
    this.render();
  }
}
