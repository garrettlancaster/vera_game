import { TALLY_SLATE, MEAT } from '../../core/voxel-grid.js';
import { toolScreen } from '../../player/arm.js';
import { inventory, INV_SIZE, STACK_MAX, ITEM_INFO } from '../inventory.js';
import { HUNGER_MAX, HUNGER_DRAIN, hungerState } from '../../player/stats.js';
import { registerTool, rough } from './tool-device.js';

// ============================================================ tally slate (Slice 2)
// The second legibility surface, per IMPLEMENTATION_PLAN.md's Slice 2: "turn the opaque
// HUD into legible quantities, still framed as practical." Same shape as the Range Rod
// (a tool earned from a settler, magnitude-rounded, never an always-on HUD) — proves the
// ToolDevice pattern from DEV_HANDOFF.md §4 generalizes to a second tool with zero changes
// to tool-device.js itself. Granted by Wren at Hearth Camp; see entities/npc/npc.js.
//
// Stock: how much you're carrying, rounded the same way the Range Rod rounds distance.
// Rate: a plain-language projection of how long the current food will last at the
// player's *current* pace — never a raw "hunger = 6.4/10" figure.

function totalsCarried() {
  let blocks = 0, meat = 0;
  for (const st of inventory) {
    if (!st) continue;
    if (st.id === MEAT) meat += st.count;
    else if (!ITEM_INFO[st.id].tool) blocks += st.count;   // tools aren't "stock" to tally
  }
  return { blocks, meat };
}

// how many minutes of food are left at the current drain rate, bucketed into a feel —
// never the raw minute count, per MATH_PLAN.md §1's number-sense-over-precision rule
function foodBand() {
  if (hungerState.level <= 1e-6) return 'out — find something to eat';
  const drainPerSec = HUNGER_DRAIN[hungerState.mode] || HUNGER_DRAIN.idle;
  const minutesLeft = hungerState.level / drainPerSec / 60;
  if (minutesLeft < 3)  return 'running out fast';
  if (minutesLeft < 10) return 'running low soon';
  if (minutesLeft < 30) return 'holding steady';
  return 'will last a good while';
}

function paintToolScreen(stockFrac, foodFrac) {
  if (!toolScreen.ctx) return;
  const g = toolScreen.ctx;
  g.fillStyle = '#3a2c1c'; g.fillRect(0, 0, 32, 32);   // dark wood-slate background
  g.fillStyle = '#d8c39a';                              // pale scratched-in marks
  g.fillRect(3, 7, 26 * stockFrac, 4);
  g.fillRect(3, 23, 26 * foodFrac, 4);
  toolScreen.tex.needsUpdate = true;
}

let lastTotals = { blocks: 0, meat: 0 };
function onUpdate() {
  lastTotals = totalsCarried();
  const stockFrac = Math.max(0.04, Math.min(1, (lastTotals.blocks + lastTotals.meat) / (INV_SIZE * STACK_MAX)));
  const foodFrac = Math.max(0.02, Math.min(1, hungerState.level / HUNGER_MAX));
  paintToolScreen(stockFrac, foodFrac);
}

function screenText() {
  const { blocks, meat } = lastTotals;
  let out = 'TALLY SLATE';
  out += '\nstock    ' + (blocks === 0 ? 'empty-handed' : '~' + rough(blocks) + ' carried');
  out += '\nmeat     ' + (meat === 0 ? 'none on you' : '~' + rough(meat));
  out += '\nfood     ' + foodBand();
  return out;
}

registerTool({ itemId: TALLY_SLATE, onUpdate, screenText });
