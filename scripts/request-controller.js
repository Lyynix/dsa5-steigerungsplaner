import PlannerData from './planner-data.js';

// Requests for items that need GM approval instead of being bought step by step (special
// abilities, spells, liturgies, ...). An entry looks like
//   { id, uuid, name, type, img, level, variant, status }
// - uuid/name/type/img: taken from the request index
// - level: the wanted level for leveled special abilities/advantages, otherwise null
// - variant: the chosen variant (adoption), e.g. { name: 'Klettern', itemId: '...' }, otherwise
//   null. itemId is set when the variant is an item of the character - the system needs the real
//   item on approval, its StF can change the cost
// - status: 'planned' or 'requested'
export default class RequestController {
  // Returns the new entry, or null if the same item with the same variant is already in there.
  static async addRequest(actor, item, { level = null, variant = null } = {}) {
    if (!actor.isOwner) return null;

    const requests = PlannerData.getRequests(actor);
    const exists = requests.some((r) => r.uuid === item.uuid && (r.variant?.name ?? null) === (variant?.name ?? null));
    if (exists) return null;

    const entry = {
      id: foundry.utils.randomID(),
      uuid: item.uuid,
      name: item.name,
      type: item.type,
      img: item.img,
      level,
      variant,
      status: 'planned',
    };
    requests.push(entry);
    await PlannerData.saveRequests(actor, requests);
    return entry;
  }

  static async markRequested(actor, id) {
    await this.#setStatus(actor, id, 'requested');
  }

  // Takes a request back from the GM, it stays in the plan as planned.
  static async withdrawRequest(actor, id) {
    await this.#setStatus(actor, id, 'planned');
  }

  static async #setStatus(actor, id, status) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const entry = requests.find((r) => r.id === id);
    if (!entry || entry.status === status) return;

    entry.status = status;
    await PlannerData.saveRequests(actor, requests);
  }

  static async removeRequest(actor, id) {
    if (!actor.isOwner) return;

    const requests = PlannerData.getRequests(actor);
    const remaining = requests.filter((r) => r.id !== id);
    if (remaining.length === requests.length) return;

    await PlannerData.saveRequests(actor, remaining);
  }
}
