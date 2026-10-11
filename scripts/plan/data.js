/**
 * @file Storage of the plan, the consumed steps and the requests as actor flags. The plan is a flat,
 * ordered array of steps; the steps of one target (type + key) form its queue.
 */

import { FLAG_CONSUMED, FLAG_PLAN, FLAG_REQUESTS, MODULE_ID } from '../config.js';
import { applyingIds } from './state.js';

/**
 * A planned step.
 * @typedef {object} PlanEntry
 * @property {string} id
 * @property {string} type    'attribute' | 'point' | 'item' | 'permanentLoss'
 * @property {string} key     Attribute or point key, or the item's id.
 * @property {string} label
 * @property {number} from
 * @property {number} to
 * @property {number} cost    AP, negative for a decrease.
 * @property {?string} category  Improvement cost (A-E), null for rebuys.
 * @property {boolean} [sinceConsume]  Planned after the target's last consumed step, see
 *   PlannerController.pruneConsumed. Missing on steps from older versions.
 */

/**
 * The plan steps of one target, in queue order.
 * @typedef {object} PlanGroup
 * @property {string} type
 * @property {string} key
 * @property {string} label
 * @property {PlanEntry[]} steps
 * @property {number} totalCost
 */

/** Reads and writes the module's actor flags. Getters return copies, safe to change. */
export default class PlannerData {
  /**
   * @param {Actor} actor
   * @returns {PlanEntry[]}
   */
  static getPlan(actor) {
    return foundry.utils.duplicate(actor.getFlag(MODULE_ID, FLAG_PLAN) ?? []);
  }

  /**
   * @param {Actor} actor
   * @param {PlanEntry[]} plan
   * @returns {Promise<void>}
   */
  static async savePlan(actor, plan) {
    await actor.setFlag(MODULE_ID, FLAG_PLAN, plan);
  }

  /**
   * @param {Actor} actor
   * @returns {PlanEntry[]} The consumed steps, see FLAG_CONSUMED.
   */
  static getConsumed(actor) {
    return foundry.utils.duplicate(actor.getFlag(MODULE_ID, FLAG_CONSUMED) ?? []);
  }

  /**
   * @param {Actor} actor
   * @param {PlanEntry[]} consumed
   * @returns {Promise<void>}
   */
  static async saveConsumed(actor, consumed) {
    await actor.setFlag(MODULE_ID, FLAG_CONSUMED, consumed);
  }

  /**
   * @param {Actor} actor
   * @returns {Request[]} The catalog entries and requests.
   */
  static getRequests(actor) {
    return foundry.utils.duplicate(actor.getFlag(MODULE_ID, FLAG_REQUESTS) ?? []);
  }

  /**
   * @param {Actor} actor
   * @param {Request[]} requests
   * @returns {Promise<void>}
   */
  static async saveRequests(actor, requests) {
    await actor.setFlag(MODULE_ID, FLAG_REQUESTS, requests);
  }

  /**
   * Index of a target's first step in the plan.
   * @param {PlanEntry[]} plan
   * @param {string} type
   * @param {string} key
   * @returns {number} -1 if nothing is planned for it.
   */
  static firstIndex(plan, type, key) {
    return plan.findIndex((e) => e.type === type && e.key === key);
  }

  /**
   * Index of a target's last step in the plan.
   * @param {PlanEntry[]} plan
   * @param {string} type
   * @param {string} key
   * @returns {number} -1 if nothing is planned for it.
   */
  static lastIndex(plan, type, key) {
    for (let i = plan.length - 1; i >= 0; i--) {
      if (plan[i].type === type && plan[i].key === key) return i;
    }
    return -1;
  }

  /**
   * The plan grouped by target, in queue order - for the tab and the badges. Steps being applied
   * right now are left out, see applyingIds.
   * @param {Actor} actor
   * @returns {Map<string, PlanGroup>} Keyed by "type:key".
   */
  static getGroups(actor) {
    const groups = new Map();
    for (const entry of this.getPlan(actor)) {
      if (applyingIds.has(entry.id)) continue;

      const groupKey = `${entry.type}:${entry.key}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { type: entry.type, key: entry.key, label: entry.label, steps: [], totalCost: 0 });
      }
      const group = groups.get(groupKey);
      group.steps.push(entry);
      group.totalCost += entry.cost;
    }
    return groups;
  }
}
