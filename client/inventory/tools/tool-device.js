// ============================================================ the ToolDevice pattern
// Per DEV_HANDOFF.md §4: a handheld legibility tool the player earns from a helper NPC.
// A device registers itself by item id; main.js's animate loop calls onUpdate() every
// frame ONLY while that item is held, then reads screenText() for the HUD echo panel.
// Keep screenText() magnitude-rounded / plain-language (MATH_PLAN.md §1 rule 2) — an
// exact-to-the-block reading fails the concealment test the same way a stated fact would.
const registry = new Map();

export function registerTool(device) { registry.set(device.itemId, device); }
export function getToolFor(itemId) { return registry.get(itemId); }
