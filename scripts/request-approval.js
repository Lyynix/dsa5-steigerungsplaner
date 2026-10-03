import { FLAG_REQUESTS, MODULE_ID } from './module-config.js';
import PlannerController from './planner-controller.js';
import PlannerData from './planner-data.js';
import RequestController from './request-controller.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// The GM's window with every character's open requests. It opens on login when there's something
// to decide and whenever a player asks for something; the actors directory has a button for it too.
export default class RequestApproval extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'steigerungsplaner-request-approval',
    classes: ['steigerungsplaner-request-approval'],
    position: { width: 560, height: 'auto' },
    window: { title: 'STEIGERUNGSPLANER.ApprovalTitle', icon: 'fas fa-scroll', resizable: true },
    actions: {
      approve: RequestApproval.#onApprove,
      reject: RequestApproval.#onReject,
      openSheet: RequestApproval.#onOpenSheet,
    },
  };

  static PARTS = {
    list: { template: `modules/${MODULE_ID}/templates/request-approval.hbs` },
  };

  static open() {
    const app = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id) ?? new RequestApproval();
    return app.render({ force: true });
  }

  // Re-renders the window if it's open, e.g. after a player withdrew a request - or closes it once
  // nothing is left to decide. Opened by hand it still shows that there's nothing open.
  static refresh() {
    const app = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
    if (!app?.rendered) return;
    if (this.pendingActors().length) app.render();
    else app.close();
  }

  static pendingActors() {
    return game.actors.filter((actor) => PlannerData.getRequests(actor).some((r) => r.status === 'requested'));
  }

  // Hooks for the GM: open on login if something's waiting, tell them about new requests, and a
  // button in the actors directory. Players get told when the GM decided on one of theirs.
  static register() {
    const known = new Map(game.actors.map((actor) => [actor.id, this.#snapshot(actor)]));

    Hooks.on('updateActor', (actor, changes, options, userId) => {
      if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG_REQUESTS}`)) return;

      const before = known.get(actor.id) ?? new Map();
      const after = this.#snapshot(actor);
      known.set(actor.id, after);

      if (game.user.isGM) {
        this.refresh();
        if (userId === game.user.id) return;
        const asked = [...after.values()].filter((r) => r.status === 'requested' && before.get(r.id)?.status !== 'requested');
        if (!asked.length) return;
        for (const request of asked) {
          ui.notifications.info(game.i18n.format('STEIGERUNGSPLANER.ApprovalNew', { actor: actor.name, name: RequestController.label(request) }));
        }
        this.open();
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

    Hooks.on('renderActorDirectory', (app, html) => {
      const root = html instanceof HTMLElement ? html : html[0];
      const actions = root?.querySelector('.header-actions');
      if (!actions || actions.querySelector('.steigerungsplaner-approval-button')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'steigerungsplaner-approval-button';
      button.innerHTML = `<i class="fas fa-scroll"></i> ${game.i18n.localize('STEIGERUNGSPLANER.ApprovalButton')}`;
      button.addEventListener('click', () => this.open());
      actions.append(button);
    });
    ui.actors?.render();

    if (this.pendingActors().length) this.open();
  }

  static #snapshot(actor) {
    return new Map(PlannerData.getRequests(actor).map((r) => [r.id, r]));
  }

  #documents = new Map();

  async #document(uuid) {
    if (!this.#documents.has(uuid)) this.#documents.set(uuid, await fromUuid(uuid));
    return this.#documents.get(uuid);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const enrich = (text) => foundry.applications.ux.TextEditor.implementation.enrichHTML(text);

    context.actors = [];
    for (const actor of RequestApproval.pendingActors()) {
      const requests = [];
      for (const request of PlannerData.getRequests(actor).filter((r) => r.status === 'requested')) {
        const doc = await this.#document(request.uuid);
        const label = RequestController.label(request);
        const cost = RequestController.requestCost(actor, request);
        requests.push({
          id: request.id,
          img: request.img,
          // A link to the item in its compendium, so the GM can read it up.
          link: await enrich(`@UUID[${request.uuid}]{${label}}`),
          level: request.level,
          cost,
          costUnknown: cost === null,
          requirements: doc?.system.requirements?.value ?? '',
        });
      }
      context.actors.push({ id: actor.id, name: actor.name, img: actor.img, availableXP: PlannerController.availableXP(actor), requests });
    }
    return context;
  }

  static #actorFor(target) {
    return game.actors.get(target.closest('[data-actor-id]')?.dataset.actorId);
  }

  static async #onApprove(event, target) {
    const actor = RequestApproval.#actorFor(target);
    if (!actor) return;
    target.disabled = true;
    await RequestController.approveRequest(actor, target.closest('[data-request-id]').dataset.requestId);
    RequestApproval.refresh();
  }

  static async #onReject(event, target) {
    const actor = RequestApproval.#actorFor(target);
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
    RequestApproval.refresh();
  }

  static #onOpenSheet(event, target) {
    RequestApproval.#actorFor(target)?.sheet.render(true);
  }
}
