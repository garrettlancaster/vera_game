import { vnoise } from './rng.js';

// ============================================================ config
export const W = 960, D = 960, H = 28;      // world size (x, z, height) — 2.5x the old map
export const CH = 32;                       // region size along x/z (edited regions are rebuilt as a whole)
export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, WOOD = 4, LEAVES = 5, SAND = 6, WATER = 7, MEAT = 8, CACTUS = 9, TALL_GRASS = 10;
export const RANGE_ROD = 11;   // handheld surveyor tool (given by an NPC, used to measure distance & height)
export const TALLY_SLATE = 12; // handheld stock/rate readout (given by an NPC, Slice 2 — see IMPLEMENTATION_PLAN.md)
export const WL = 6;                        // water level — water fills y <= WL where terrain is lower

// ============================================================ world storage
export const blocks = new Uint8Array(W * H * D);
export const idx = (x, y, z) => (z * W + x) * H + y;
export function inBounds(x, y, z) { return x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H; }
export function blockAt(x, y, z) { return inBounds(x, y, z) ? blocks[idx(x, y, z)] : AIR; }
export function setBlockRaw(x, y, z, id) { if (inBounds(x, y, z)) blocks[idx(x, y, z)] = id; }
export function setBlockRawIfAir(x, y, z, id) { if (inBounds(x, y, z) && blocks[idx(x, y, z)] === AIR) blocks[idx(x, y, z)] = id; }
// solid for physics: treat the void outside the map as walls so you can't fall off
export function solidForPhysics(x, y, z) {
  if (y < 0 || y >= H) return false;
  if (x < 0 || x >= W || z < 0 || z >= D) return true;
  const b = blocks[idx(x, y, z)];
  if (b === TALL_GRASS) return false;        // tall grass: no hitbox, you can walk through it
  return b !== AIR && b !== WATER;           // water is walk-through for now (no swimming yet)
}

// ============================================================ terrain generation
export function heightAt(x, z) {
  // gentle plains base
  let h = 8 + vnoise(x * 0.05 + 37.2, z * 0.05 + 11.9) * 4.5   // broad rolling
           + vnoise(x * 0.16 + 91.4, z * 0.16 + 53.8) * 2;     // detail bumps
  // small mountains: a mask picks the regions, ridged noise shapes the peaks
  const mm = vnoise(x * 0.035 + 7.7, z * 0.035 + 91.3);
  if (mm > 0.58) {
    const t = (mm - 0.58) / 0.42;
    const ridge = 1 - Math.abs(2 * vnoise(x * 0.09 + 13.7, z * 0.09 + 41.2) - 1);
    h += Math.pow(t, 1.6) * (5 + 13 * ridge);
  }
  // lakes: broad depressions that drop below the water level
  const lm = vnoise(x * 0.028 + 53.1, z * 0.028 + 7.9);
  if (lm > 0.66) h -= Math.pow((lm - 0.66) / 0.34, 1.4) * 6;
  return Math.max(2, Math.min(H - 8, Math.floor(h)));
}

// sandy beaches around the water + patchy dune areas on the plains
export function isSandy(x, z, h) {
  if (h <= WL + 1) return true;              // shoreline / beach ring
  const dm = vnoise(x * 0.045 + 23.5, z * 0.045 + 67.3);
  return dm > 0.68 && h < 15;                // dune patches
}

export function topSolidY(x, z) { for (let y = H - 1; y >= 0; y--) { const b = blocks[idx(x, y, z)]; if (b !== AIR && b !== TALL_GRASS) return y; } return -1; }   // tall grass is walk-through: not "solid" for spawn/mob ground checks
