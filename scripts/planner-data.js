import { FLAG_CONSUMED, FLAG_PLAN, MODULE_ID } from './module-config.js';
import { applyingIds } from './planner-state.js';

// Reads/writes the plan as an actor flag. The plan is a flat, ordered array of entries;
// entries belonging to the same target (type+key) form an implicit FIFO/LIFO queue.
export default class PlannerData {
  static getPlan(actor) {
    return foundry.utils.duplicate(actor.getFlag(MODULE_ID, FLAG_PLAN) ?? []);
  }

  static async savePlan(actor, plan) {
    await actor.setFlag(MODULE_ID, FLAG_PLAN, plan);
  }

  static getConsumed(actor) {
    return foundry.utils.duplicate(actor.getFlag(MODULE_ID, FLAG_CONSUMED) ?? []);
  }

  static async saveConsumed(actor, consumed) {
    await actor.setFlag(MODULE_ID, FLAG_CONSUMED, consumed);
  }

  static firstIndex(plan, type, key) {
    return plan.findIndex((e) => e.type === type && e.key === key);
  }

  static lastIndex(plan, type, key) {
    for (let i = plan.length - 1; i >= 0; i--) {
      if (plan[i].type === type && plan[i].key === key) return i;
    }
    return -1;
  }

  // Groups the flat plan array by target (type+key), preserving queue order within each group.
  // Shared by the planner tab (full list) and the inline sheet badges (counts/tooltips). Entries
  // mid-apply (see planner-state.js) are left out so they don't flash back into an intermediate
  // render while the plan flag is momentarily stale.
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
