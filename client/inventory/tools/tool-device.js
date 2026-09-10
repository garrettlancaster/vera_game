// ============================================================ the ToolDevice pattern
// Per DEV_HANDOFF.md §4: a handheld legibility tool the player earns from a helper NPC.
// A device registers itself by item id; main.js's animate loop calls onUpdate() every
// frame ONLY while that item is held, then reads screenText() for the HUD echo panel.
// Keep screenText() magnitude-rounded / plain-language (MATH_PLAN.md §1 rule 2) — an
// exact-to-the-block reading fails the concealment test the same way a stated fact would.
const registry = new Map();

export function registerTool(device) { registry.set(device.itemId, device); }
export function getToolFor(itemId) { return registry.get(itemId); }

// Shared magnitude-aware rounding: small quantities read exactly, large ones coarser.
// Originally lived only in range-rod.js; moved here once tally-slate.js needed the same
// "reasonable estimate, not a precise figure" style — see IMPLEMENTATION_PLAN.md's Slice 2
// log. Every ToolDevice's screenText() should run its numbers through this rather than
// printing an exact count; range-rod.js re-exports it for its existing importers.
export function rough(n) {
  const a = Math.abs(n);
  if (a < 10)  return Math.round(n);
  if (a < 100) return Math.round(n / 5) * 5;
  if (a < 500) return Math.round(n / 10) * 10;
  return Math.round(n / 25) * 25;
}
