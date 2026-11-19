import { AIR, GRASS, DIRT, WATER, TALL_GRASS, WL, H, inBounds, blockAt, setBlockRaw, topSolidY } from '../../core/voxel-grid.js';
import { rebuildAround } from '../../core/chunks.js';

// ============================================================ settler work sites
// World props a settler's contexts are *about* — real blocks the player can walk around
// and count, never a number handed over in dialogue (STORYLINE.md §5.3's guardrail: "the
// footprint must never be handed over as two numbers only; the player must be able to walk
// or look at it"). A site builder is named from quest-data.js via `spawn.site`; npc.js's
// engine calls it at spawn time and stores the result on the NPC as `n.site`. It returns
// null if the spot is unsuitable (water, too steep, on top of someone else's landmark), in
// which case the engine tries the next spot on the settler's spawn ring.

// Bram's quarry yard: a levelled pad with (a) a marked strip where he will raise a wall,
// one stone at a time, and (b) a sunken store-room floor, one block deep, for the player
// to pave. Layout, relative to Bram at (tx, tz), pad surface at height h:
//   pad    x: tx-2 .. tx+10   z: tz-3 .. tz+8
//   wall   x: tx+2 .. tx+6    z: tz-2          rows h+1 .. h+4   (built later, by Bram)
//   room   x: tx+3 .. tx+8    z: tz+3 .. tz+6  sunk: air at y=h, dirt at y=h-1
const PAD = { x0: -2, x1: 10, z0: -3, z1: 8 };
const WALL = { x0: 2, z: -2, perRow: 5, rows: 4 };
const ROOM = { x0: 3, z0: 3, w: 6, d: 4 };
const MAX_LEVELLING = 3;   // don't bulldoze a hillside or fill a lake to make the yard

export function buildQuarrySite(tx, tz, h, avoid) {
  if (h + WALL.rows + 2 >= H || h - 1 <= WL) return null;
  for (let dz = PAD.z0; dz <= PAD.z1; dz++) for (let dx = PAD.x0; dx <= PAD.x1; dx++) {
    const x = tx + dx, z = tz + dz;
    if (!inBounds(x, 1, z)) return null;
    const top = topSolidY(x, z);
    if (blockAt(x, top, z) === WATER || Math.abs(top - h) > MAX_LEVELLING) return null;
  }
  for (const p of avoid) {
    if (p.x >= tx + PAD.x0 - 4 && p.x <= tx + PAD.x1 + 4 && p.z >= tz + PAD.z0 - 4 && p.z <= tz + PAD.z1 + 4) return null;
  }

  for (let dz = PAD.z0; dz <= PAD.z1; dz++) for (let dx = PAD.x0; dx <= PAD.x1; dx++) {
    const x = tx + dx, z = tz + dz;
    for (let y = 1; y < h; y++) {
      const b = blockAt(x, y, z);
      if (b === AIR || b === WATER || b === TALL_GRASS || b === GRASS) setBlockRaw(x, y, z, DIRT);
    }
    setBlockRaw(x, h, z, GRASS);
    for (let y = h + 1; y < H; y++) setBlockRaw(x, y, z, AIR);   // clears trees/grass standing on the pad
  }
  const room = { x0: tx + ROOM.x0, z0: tz + ROOM.z0, w: ROOM.w, d: ROOM.d, y: h };
  for (let j = 0; j < room.d; j++) for (let i = 0; i < room.w; i++) setBlockRaw(room.x0 + i, h, room.z0 + j, AIR);

  // the wall's stones in the order Bram lays them: a full row, then the next row up
  const cells = [];
  for (let r = 0; r < WALL.rows; r++) for (let i = 0; i < WALL.perRow; i++) cells.push({ x: tx + WALL.x0 + i, y: h + 1 + r, z: tz + WALL.z });

  rebuildPad(tx, tz);
  return { h, wall: { cells, perRow: WALL.perRow, rows: WALL.rows }, room };
}

// the pad can straddle a region boundary, so rebuild around each corner, not just the centre
function rebuildPad(tx, tz) {
  for (const dx of [PAD.x0, PAD.x1]) for (const dz of [PAD.z0, PAD.z1]) rebuildAround(tx + dx, tz + dz);
}

// a settler changing one block of their own site (Bram laying a stone)
export function setSiteBlock(x, y, z, id) {
  setBlockRaw(x, y, z, id);
  rebuildAround(x, z);
}

export function roomCells(room) {
  const out = [];
  for (let j = 0; j < room.d; j++) for (let i = 0; i < room.w; i++) out.push({ x: room.x0 + i, y: room.y, z: room.z0 + j });
  return out;
}
