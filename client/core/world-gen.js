import { rnd, vnoise, vnoise3 } from './rng.js';
import {
  W, D, H, WL, AIR, GRASS, DIRT, STONE, WOOD, LEAVES, SAND, WATER, CACTUS, TALL_GRASS,
  blocks, idx, inBounds, blockAt, setBlockRaw, setBlockRawIfAir, heightAt, isSandy,
} from './voxel-grid.js';

// ---- biomes beyond the plains -------------------------------------------
// desert: a broad inland region of sand with cacti (no trees) — separate noise field
export function desertAt(x, z) { return vnoise(x * 0.02 + 61.8, z * 0.02 + 37.4); }

// forest: dense tree cover in noisy clusters (the old "grass is full of trees" look, now an
// actual biome). All other land is plains — open ground with few scattered trees and tall grass.
export function forestAt(x, z) { return vnoise(x * 0.017 + 42.6, z * 0.017 + 83.9); }
export const FOREST_CUTOFF = 0.58;

// ocean: a meandering coastline along one edge of the map; past it the seafloor sinks.
// The wavy coast makes bays and peninsulas ("half islands"), plus real open water off the edge.
export function seaDepthAt(x, z) {
  const coast = D * (0.62 + 0.42 * vnoise(x * 0.016 + 31.4, z * 0.016 + 9.7)); // ~0.62D .. 1.04D
  return Math.max(0, Math.min(13, (z - coast) * 0.38));                        // depth beyond the shore
}

// islands: a few noise-bumped rises standing up out of the open sea
export const ISLANDS = [];
{
  let tries = 0;
  while (ISLANDS.length < 4 && tries++ < 600) {
    const x = Math.floor(rnd() * W), z = Math.floor(rnd() * D);
    if (seaDepthAt(x, z) < 5) continue;                       // must stand in genuinely deep water
    let tooClose = false;
    for (const o of ISLANDS) if (Math.hypot(o.x - x, o.z - z) < 100) { tooClose = true; break; }
    if (tooClose) continue;
    ISLANDS.push({ x, z, r: 9 + rnd() * 12, bump: 5 + rnd() * 6 });
  }
}

// river: winds edge-to-edge across the map along x — its centreline meanders via noise
export function riverZ(x)     { return D * 0.46 + vnoise(x * 0.013 + 71.3, 8.9) * D * 0.22; }
export function riverHalfW(x) { return 2.5 + vnoise(x * 0.02 + 15.6, 44.7) * 3.5; }

export function plantTree(x, y, z) {
  const trunkH = 4 + Math.floor(rnd() * 2); // 4–5
  for (let i = 0; i < trunkH && y + i < H - 3; i++) setBlockRaw(x, y + i, z, WOOD);
  const topY = y + trunkH - 1;
  const putLeaves = (ly, r, cornerChance) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dz === 0) continue;               // keep the trunk line clear
      const corner = Math.abs(dx) === r && Math.abs(dz) === r;
      if (corner && rnd() > cornerChance) continue;
      setBlockRawIfAir(x + dx, ly, z + dz, LEAVES);
    }
  };
  putLeaves(topY - 1, 2, 0.45);
  putLeaves(topY, 2, 0.8);
  putLeaves(topY + 1, 1, 0.6);
}

// final terrain height of every column - caves/entrances/trees need the CARVED heights, not heightAt()
export const surfH = new Uint8Array(W * D);

export function plantCactus(x, y, z) {
  const ch = 2 + Math.floor(rnd() * 3);          // 2-4 tall, like vanilla cacti
  for (let i = 0; i < ch && y + i < H - 1; i++) setBlockRawIfAir(x, y + i, z, CACTUS);
}

export function generateWorld() {
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let h = heightAt(x, z);
    const desert = desertAt(x, z) > 0.62 && h > WL + 1;

    // river: carve a meandering channel edge-to-edge - deep mid-channel, sandy shallow edges
    const dzR = Math.abs(z - riverZ(x)), hw = riverHalfW(x);
    let bankSandy = false;
    if (dzR < hw) {
      h = Math.min(h, Math.floor(WL - 1 - (1 - dzR / hw) * 3));   // bed ~4 below water mid-channel
    } else if (dzR < hw + 2 && h > WL) bankSandy = true;          // sandy banks on both sides

    // ocean: sink everything past the coastline under the water level - bays, peninsulas & open sea
    const sd = seaDepthAt(x, z);
    if (sd > 0) h = Math.max(0, Math.min(h, WL - 1 - Math.floor(sd)));

    // islands: domed rises standing up out of the deep sea (beach fringe via isSandy's shoreline ring)
    for (const isl of ISLANDS) {
      const dx = x - isl.x, dz2 = z - isl.z;
      const r2 = isl.r * isl.r;
      if (dx * dx + dz2 * dz2 < r2) {
        const f = Math.sqrt(1 - (dx * dx + dz2 * dz2) / r2);       // 1 at dome centre -> 0 at its edge
        h = Math.max(h, WL + 1 + Math.pow(f, 1.6) * isl.bump + vnoise(x * 0.25 + isl.x, z * 0.25 + isl.z) * 2);
      }
    }

    const sandy = bankSandy || desert || isSandy(x, z, h);
    surfH[z * W + x] = h;
    for (let y = 0; y <= h; y++) {
      let id;
      if (y === h)                  id = sandy ? SAND : GRASS;   // top layer
      else if (y >= h - (desert ? 4 : 2))  id = sandy ? SAND : DIRT;  // sub-surface band (deeper sand in desert)
      else                           id = STONE;
      blocks[idx(x, y, z)] = id;
    }
    if (h < WL) for (let y = h + 1; y <= WL; y++) blocks[idx(x, y, z)] = WATER;
  }

  // caves — carve pockets and tunnels below the surface with 3D noise
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const h = surfH[z * W + x];      // the CARVED surface (rivers/ocean lowered some columns)
    for (let y = 2; y < h - 1; y++) {   // keep a thin shell under the surface layer
      const n = vnoise3(x * 0.09, y * 0.13, z * 0.09) + 0.45 * vnoise3(x * 0.2, y * 0.28, z * 0.2);
      if (n > 1.0) blocks[idx(x, y, z)] = AIR;
    }
  }

  // surface cave entrances — find a nearby cave column and dig a shaft down to it
  const nEntrances = 36;   // tripled (was 12) — map got bigger
  for (let e = 0; e < nEntrances; e++) {
    let ax, az, ah, tries = 0;
    do {
      ax = 8 + Math.floor(rnd() * (W - 16));
      az = 8 + Math.floor(rnd() * (D - 16));
      ah = surfH[az * W + ax];
      tries++;
    } while ((ah <= WL || isSandy(ax, az, ah)) && tries < 20); // only on dry, non-sand land
    let ex = -1, ez = -1;
    for (let r = 0; r <= 24 && ex < 0; r++) {      // ring search for a cave column
      for (let dz = -r; dz <= r && ex < 0; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx2 = ax + dx, cz2 = az + dz;
        if (!inBounds(cx2, 3, cz2)) continue;
        const h2 = surfH[cz2 * W + cx2];
        let hasCave = false;
        for (let y = Math.max(2, h2 - 14); y < h2 - 1; y++) {
          if (blockAt(cx2, y, cz2) === AIR) { hasCave = true; break; }
        }
        if (hasCave) { ex = cx2; ez = cz2; }
      }
    }
    if (ex < 0) continue;                          // no cave nearby — skip this entrance
    const h = surfH[ez * W + ex];
    let y = h;
    for (; y >= 2; y--) {                          // dig the shaft down to the cave
      setBlockRaw(ex, y, ez, AIR);
      if (blockAt(ex, y - 1, ez) === AIR) break;   // reached a cave
    }
    for (let dy = 0; dy <= 2; dy++)                // open up the mouth on the surface
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        setBlockRaw(ex + dx, h - dy, ez + dz, AIR);
    if (blockAt(ex, y - 1, ez) === AIR)            // widen where the shaft meets the cave
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
          setBlockRaw(ex + dx, y + dy, ez + dz, AIR);
  }

  // vegetation — only on grass, away from the edges:
  // dense woods where forestAt is high; elsewhere open plains with just a few trees and tall grass
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const h = surfH[z * W + x];
    if (h <= WL) continue;                       // nothing grows in water columns
    const topId = blockAt(x, h, z);
    if (topId === GRASS) {
      const forest = forestAt(x, z) > FOREST_CUTOFF;
      if (rnd() < (forest ? 0.022 : 0.004)) plantTree(x, h + 1, z);
      else if (rnd() < (forest ? 0.05 : 0.16)) setBlockRawIfAir(x, h + 1, z, TALL_GRASS);   // walk-through tall grass, denser on the plains
    }
    else if (topId === SAND && desertAt(x, z) > 0.62 && h >= WL + 3 && rnd() < 0.0108) plantCactus(x, h + 1, z);   // cacti in the desert only (spawns reduced by 40%: 0.018 -> 0.0108)
  }
}
