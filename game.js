import * as THREE from 'three';
import SFX from './sounds.js';

// ============================================================ config
const W = 960, D = 960, H = 28;      // world size (x, z, height) — 2.5x the old map
const CH = 32;                       // region size along x/z (edited regions are rebuilt as a whole)
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, WOOD = 4, LEAVES = 5, SAND = 6, WATER = 7, MEAT = 8, CACTUS = 9, TALL_GRASS = 10;
const RANGE_ROD = 11;   // handheld surveyor tool (given by an NPC, used to measure distance & height)
const WL = 6;                        // water level — water fills y <= WL where terrain is lower

// player
const EYE = 1.62, PHEIGHT = 1.8, PHALF = 0.3;
const GRAVITY = 26, JUMP_V = 8.4, WALK_SPEED = 4.4, SPRINT_MULT = 1.55;
// swimming (simplified Minecraft): slower horizontal speed in water, weak gravity,
// Space floats you back to the surface, Shift makes you dive down
const SWIM_SPEED_MULT = 0.62,   // swim speed vs land walk (vanilla-ish "much slower")
      WATER_GRAV_MULT = 0.35,   // scaled-down gravity while any part of the body is in water
      WATER_FALL_CAP = -4.2,    // max sink speed passively — falling into water never hurts / kills
      SWIM_RISE_SPEED = 2.9;    // upward velocity you accelerate toward while holding Space
const REACH = 6;

// ============================================================ sound hooks
const STEP_DIST = 2.1;      // world units travelled per footstep
let stepAccum = 0;
function surfaceUnderFoot() {
  const fy = Math.floor(player.pos.y - EYE - 0.2);     // block just under the soles (feet rest ~0.02 above the surface)
  for (const [ox, oz] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
    const id = blockAt(Math.floor(player.pos.x + ox), fy, Math.floor(player.pos.z + oz));
    if (id !== AIR && id !== TALL_GRASS) return id;   // walk-through grass is not "solid underfoot"
  }
  return DIRT;                                          // no solid underfoot — treat as dirt
}

// ============================================================ seeded rng (stable world per load)
let seedState = 90210;
function rnd() {
  seedState |= 0; seedState = (seedState + 0x6D2B79F5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ============================================================ value noise for terrain
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// 3D value noise (for caves)
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    r += w * hash3(xi + dx, yi + dy, zi + dz);
  }
  return r;
}

// ============================================================ world storage
const blocks = new Uint8Array(W * H * D);
const idx = (x, y, z) => (z * W + x) * H + y;
function inBounds(x, y, z) { return x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H; }
function blockAt(x, y, z) { return inBounds(x, y, z) ? blocks[idx(x, y, z)] : AIR; }
function setBlockRaw(x, y, z, id) { if (inBounds(x, y, z)) blocks[idx(x, y, z)] = id; }
// solid for physics: treat the void outside the map as walls so you can't fall off
function solidForPhysics(x, y, z) {
  if (y < 0 || y >= H) return false;
  if (x < 0 || x >= W || z < 0 || z >= D) return true;
  const b = blocks[idx(x, y, z)];
  if (b === TALL_GRASS) return false;        // tall grass: no hitbox, you can walk through it
  return b !== AIR && b !== WATER;           // water is walk-through for now (no swimming yet)
}

// ============================================================ terrain generation
function heightAt(x, z) {
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
function isSandy(x, z, h) {
  if (h <= WL + 1) return true;              // shoreline / beach ring
  const dm = vnoise(x * 0.045 + 23.5, z * 0.045 + 67.3);
  return dm > 0.68 && h < 15;                // dune patches
}

// ---- biomes beyond the plains -------------------------------------------
// desert: a broad inland region of sand with cacti (no trees) — separate noise field
function desertAt(x, z) { return vnoise(x * 0.02 + 61.8, z * 0.02 + 37.4); }

// forest: dense tree cover in noisy clusters (the old "grass is full of trees" look, now an
// actual biome). All other land is plains — open ground with few scattered trees and tall grass.
function forestAt(x, z) { return vnoise(x * 0.017 + 42.6, z * 0.017 + 83.9); }
const FOREST_CUTOFF = 0.58;

// ocean: a meandering coastline along one edge of the map; past it the seafloor sinks.
// The wavy coast makes bays and peninsulas ("half islands"), plus real open water off the edge.
function seaDepthAt(x, z) {
  const coast = D * (0.62 + 0.42 * vnoise(x * 0.016 + 31.4, z * 0.016 + 9.7)); // ~0.62D .. 1.04D
  return Math.max(0, Math.min(13, (z - coast) * 0.38));                        // depth beyond the shore
}

// islands: a few noise-bumped rises standing up out of the open sea
const ISLANDS = [];
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
function riverZ(x)     { return D * 0.46 + vnoise(x * 0.013 + 71.3, 8.9) * D * 0.22; }
function riverHalfW(x) { return 2.5 + vnoise(x * 0.02 + 15.6, 44.7) * 3.5; }

function setBlockRawIfAir(x, y, z, id) { if (inBounds(x, y, z) && blocks[idx(x, y, z)] === AIR) blocks[idx(x, y, z)] = id; }

function plantTree(x, y, z) {
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
const surfH = new Uint8Array(W * D);

function plantCactus(x, y, z) {
  const ch = 2 + Math.floor(rnd() * 3);          // 2-4 tall, like vanilla cacti
  for (let i = 0; i < ch && y + i < H - 1; i++) setBlockRawIfAir(x, y + i, z, CACTUS);
}

function generateWorld() {
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

// ============================================================ procedural pixel textures (16x16 canvases)
function makeTex(pxFn) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  const img = g.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const [r, gr, b, a] = pxFn(x, y);
    const i = (y * 16 + x) * 4;
    img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = a === undefined ? 255 : a;   // pxFn may return an alpha (cut-out textures)
  }
  g.putImageData(img, 0, 0);
  return c;
}
const vary = (base, amt) => base.map(v => Math.max(0, Math.min(255, Math.round(v + (rnd() * 2 - 1) * amt))));

function woodTopPx(x, y) {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return vary(d < 1 ? [86, 66, 38] : (Math.floor(d) % 2 === 0 ? [152, 124, 80] : [116, 90, 54]), 7);
}

const texCanvases = {
  grassTop:  makeTex(() => vary([108, 173, 72], 15)),
  dirt:      makeTex(() => vary([134, 99, 70], 13)),
  grassSide: makeTex((x, y) => { const edge = 3 + (rnd() < 0.5 ? 0 : 1); return y < edge || (y === edge && rnd() < 0.6) ? vary([98, 162, 64], 15) : vary([134, 99, 70], 13); }),
  stone:     makeTex(() => { const base = rnd() < 0.07 ? [104, 104, 108] : [126, 126, 130]; return vary(base, 10); }),
  woodSide:  makeTex((x) => { const col = Math.sin(x * 3.1 + (x % 3) * 1.7) * 0.5 + 0.5; return vary([84 + col * 36, 62 + col * 26, 34 + col * 14], 8); }),
  woodTop:   makeTex(woodTopPx),
  leaves:    makeTex(() => { const base = rnd() < 0.1 ? [38, 78, 30] : [52, 106, 44]; return vary(base, 18); }),
  tallgrass: makeTex((x, y) => {   // MC-style blade cluster on a transparent background (alphaTest cut-out)
    if (hash2(x * 13.7, 9.2) < 0.3) return [0, 0, 0, 0];           // gaps between blades
    const hgt = 5 + Math.floor(hash2(x * 7.31, 3.7) * 10);          // blade tip height (6..15 rows from the bottom)
    if (y < 15 - hgt) return [0, 0, 0, 0];                          // above the tips: see-through
    const t = (15 - y) / hgt;                                       // 0 at the base -> 1 at the tip
    const j = hash2(x * 3.17, y * 5.9);                             // per-pixel grain
    return [Math.round(46 + t * 36 + j * 18), Math.round(110 + t * 72 + j * 24), Math.round(36 + t * 24 + j * 12)];
  }),
  sand:      makeTex(() => vary([221, 208, 162], 11)),
  water:     makeTex(() => vary([52, 108, 196], 14)),
  meat:      makeTex((x, y) => { const m = (Math.sin(x * 2.3 + y * 1.7) > 0.5); return vary(m ? [196, 74, 58] : [214, 120, 96], 12); }),
  cactus:    makeTex((x, y) => { if (rnd() < 0.07) return vary([216, 234, 200], 8);    // pale spine fleck
                     const band = (Math.sin(x * Math.PI / 2.5) > 0.15);              // vertical ribbing like a real cactus
                     return vary(band ? [86, 164, 70] : [52, 124, 46], 9); }),
   // Range Rod: a handheld instrument — a dark body with a glowing green readout panel (the hotbar icon)
  rangeRod:  makeTex((x, y) => {
    const screen = y >= 3 && y <= 6 && x >= 5 && x <= 10;
    const head   = y >= 2 && y <= 9 && x >= 3 && x <= 12;
    const grip   = y >= 10 && y <= 15 && x >= 6 && x <= 9;
    if (screen) return vary([40, 130, 80], 10);    // glowing LCD readout
    if (head)   return vary([52, 58, 70], 6);       // dark instrument body
    if (grip)   return vary([44, 48, 58], 5);       // handle
    return [0, 0, 0, 0];                            // transparent
  }),
};

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  // Our UV tables assume v=0 at the top of the image, so disable three's default vertical flip.
  t.flipY = false;
  // Mipmapping kills the distance shimmering; nearest-mip sampling keeps pixels crisp.
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapNearestFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ============================================================ face / material setup
// corners are unit-cube coords (0/1); each quad winds so its normal points outward.
const FACES = [
  { n: [1, 0, 0], c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uv: [[0,1],[0,0],[1,0],[1,1]], b: 0.62 }, // +x
  { n: [-1,0,0], c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], uv: [[1,1],[1,0],[0,0],[0,1]], b: 0.62 }, // -x
  { n: [0, 1, 0], c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [[0,1],[1,1],[1,0],[0,0]], b: 1.0  }, // +y
  { n: [0,-1, 0], c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [[0,0],[1,0],[1,1],[0,1]], b: 0.5  }, // -y
  { n: [0, 0, 1], c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], uv: [[0,1],[1,1],[1,0],[0,0]], b: 0.82 }, // +z
  { n: [0, 0,-1], c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], uv: [[1,1],[0,1],[0,0],[1,0]], b: 0.82 }, // -z
];

function materialKey(id, fi) {
  if (id === GRASS) return fi === 2 ? 'grassTop' : fi === 3 ? 'dirt' : 'grassSide';
  if (id === WOOD)  return (fi === 2 || fi === 3) ? 'woodTop' : 'woodSide';
  if (id === DIRT) return 'dirt';
  if (id === STONE) return 'stone';
  if (id === LEAVES) return 'leaves';
  if (id === SAND) return 'sand';
  if (id === WATER) return 'water';
  if (id === MEAT) return 'meat';
  if (id === CACTUS) return 'cactus';   // all faces the same prickly green
  return 'dirt';
}

const materials = {};
for (const [name, canvas] of Object.entries(texCanvases)) {
  const opts = { map: toTexture(canvas), vertexColors: true };
  if (name === 'water') { opts.transparent = true; opts.opacity = 0.62; opts.side = THREE.DoubleSide; }   // see-through blue water; DoubleSide so the surface underside is visible when submerged
  if (name === 'tallgrass') { opts.side = THREE.DoubleSide; opts.alphaTest = 0.5; }   // cross quads seen from either side; cut-out, no sorting needed
  materials[name] = new THREE.MeshBasicMaterial(opts);
}


// ============================================================ renderer & scene
const renderer = (() => {
  // No MSAA (nearest-filtered pixel textures don't benefit from it) and a capped
  // pixel ratio so high-DPI screens stop rendering up to 4x the CSS-resolution pixels.
  const r = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  r.setSize(window.innerWidth, window.innerHeight);
  document.body.prepend(r.domElement);
  return r;
})();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9fb, 48, 120);

// gradient sky dome (fog-exempt so it stays crisp)
let skyDome;
{
  // 2400 (was 380): the map is much bigger now and fog-exempt clouds can sit far from the camera - the dome must stay behind them all but inside the camera's far plane (2500)
const g = new THREE.SphereGeometry(2400, 24, 14);
  const posAttr = g.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const top = new THREE.Color(0x3f8fe0), horizon = new THREE.Color(0xcfe9fb);
  for (let i = 0; i < posAttr.count; i++) {
    const hNorm = posAttr.getY(i) / 2500;                 // -1 .. 1
    // stay exactly at the horizon color near eye level so it blends seamlessly with the fog band
    const t = Math.max(0, Math.min(1, (hNorm + 0.12) / 0.95));
    const f = t * t;
    const c = horizon.clone().lerp(top, f);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  skyDome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyDome.renderOrder = -1;
  scene.add(skyDome);
}

let sun;
// square sun with layered square glow
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,242,178,0.30)'; g.fillRect(6, 6, 116, 116);   // outer glow
  g.fillStyle = 'rgba(255,247,200,0.90)'; g.fillRect(24, 24, 80, 80);   // inner glow
  g.fillStyle = 'rgb(255,253,240)';      g.fillRect(36, 36, 56, 56);   // square core
  const t = new THREE.CanvasTexture(c);
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  sun.scale.setScalar(260 * 0.65);   // 35% smaller
  scene.add(sun);
}

// clouds — soft flat box clusters drifting on the x axis. Placed as a jittered GRID across the
// whole map (the map is now 2.5x bigger than these clouds were designed for), so there are always
// some overhead no matter where you spawn or stand, and they drift/wrap over the full width.
const cloudGroup = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }); // crisp even in the distance (MC-style)
  const CCOLS = Math.max(8, Math.round(W / 90)), CROWS = Math.max(5, Math.round(D / 136)); // cell size shrunk by ~sqrt(2) (was W/128, D/192) -> ~2x clouds for a denser sky
  for (let j = 0; j < CROWS; j++) for (let i = 0; i < CCOLS; i++) {
    const cl = new THREE.Group();
    const nPuffs = 3 + Math.floor(rnd() * 3);
    for (let p = 0; p < nPuffs; p++) {
      const wBox = 7 + rnd() * 9, dBox = 5 + rnd() * 6, hBox = 1.4 + rnd() * 1.2;
      const puff = new THREE.Mesh(new THREE.BoxGeometry(wBox, hBox, dBox), mat);
      puff.position.set((rnd() - 0.5) * 9, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 6);
      cl.add(puff);
    }
    cl.position.set((i + 0.15 + rnd() * 0.7) * W / CCOLS, H + 9 + rnd() * 7, (j + 0.15 + rnd() * 0.7) * D / CROWS);
    cloudGroup.add(cl);
  }
  scene.add(cloudGroup);
}

// ============================================================ chunk meshing
const chunkMeshes = new Map(); // "cx,cz" -> THREE.Group
const chunkWater = new Map(); // "cx,cz" -> per-chunk water geometry arrays (or null)

// All chunks' water is merged into ONE mesh: one transparent draw call per frame
// instead of three.js depth-sorting hundreds of per-chunk water buckets.
const waterMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.water);
waterMesh.renderOrder = 1;   // blend after the opaque terrain
waterMesh.visible = false;
scene.add(waterMesh);

function rebuildWater() {
 const parts = []; let np = 0, ni = 0;
 for (const d of chunkWater.values()) if (d && d.pos.length) { parts.push(d); np += d.pos.length; ni += d.idxArr.length; }
 const pos = new Float32Array(np), col = new Float32Array(np), uv = new Float32Array((np / 3) * 2);
 const ia  = new Uint32Array(ni);
 let pOff = 0, iOff = 0, vBase = 0;   // vBase: vertex offset of this part inside the merged mesh
 for (const d of parts) {
  pos.set(d.pos, pOff); col.set(d.col, pOff); uv.set(d.uv, (pOff / 3) * 2);
  for (let k = 0; k < d.idxArr.length; k++) ia[iOff + k] = d.idxArr[k] + vBase;
  iOff += d.idxArr.length; vBase += d.pos.length / 3; pOff += d.pos.length;
 }
 const geo = new THREE.BufferGeometry();
 if (ni) {
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv, 2));
  // note: setIndex() only wraps plain JS arrays - a raw typed array needs an explicit BufferAttribute.
  geo.setIndex(new THREE.BufferAttribute(ia, 1));
 }
 waterMesh.geometry.dispose();
 waterMesh.geometry = geo;
 waterMesh.visible = ni > 0;
}

function neighborIdForFaces(x, y, z) {
  if (y < 0) return STONE;            // don't render the underside of the world
  if (!inBounds(x, y, z)) return AIR; // show side walls at map edges
  return blocks[idx(x, y, z)];
}

function buildChunk(cx, cz) {
 const key = cx + ',' + cz;
 const old = chunkMeshes.get(key);
 if (old) {
  scene.remove(old);
  old.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  chunkMeshes.delete(key);
 }

 const x0 = cx * CH, z0 = cz * CH;
 // materialKey -> geometry arrays
 const buckets = {};
  let wB;   // this chunk's water part, or null if the chunk has no water
 for (let z = z0; z < Math.min(z0 + CH, D); z++)
for (let x = x0; x < Math.min(x0 + CH, W); x++)
  for (let y = 0; y < H; y++) {
   const id = blocks[idx(x, y, z)];
   if (id === AIR) continue;
   if (id === TALL_GRASS) {   // walk-through tall grass: two crossed vertical strips (MC style), no cube faces
    const nA = neighborIdForFaces(x, y + 1, z);
    if (nA !== AIR && nA !== WATER && nA !== TALL_GRASS) continue;            // fully hidden under a solid block above
    let gB = buckets['tallgrass'];
    if (!gB) gB = buckets['tallgrass'] = { pos: [], col: [], uv: [], idxArr: [] };
    const hh = 0.875;   // blades occupy the bottom ~3/4 of the cell, like vanilla tall grass
    const quads = [   // each: (bottomL, bottomR, topR, topLeft) with matching uvs - v=1 at the blade roots
      [x, y, z,     x + 1, y, z + 1,   x + 1, y + hh, z + 1,  x,     y + hh, z],
      [x + 1, y, z, x,     y, z + 1,   x,     y + hh, z + 1,  x + 1, y + hh, z] ];
    for (const q of quads) {
      const base2 = gB.pos.length / 3;
      for (let k = 0; k < 4; k++) { gB.pos.push(q[k * 3], q[k * 3 + 1], q[k * 3 + 2]); gB.col.push(1, 1, 1); }   // full-bright like top faces
      gB.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      gB.idxArr.push(base2, base2 + 1, base2 + 2, base2, base2 + 2, base2 + 3);
    }
    continue;
   }
   for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi];
    let nId = neighborIdForFaces(x + f.n[0], y + f.n[1], z + f.n[2]);
    if (nId === TALL_GRASS) nId = AIR;   // cross-plants never occlude: faces under/around tall grass must still render
    if (id !== WATER && nId !== AIR && nId !== WATER) continue; // solid against solid - hidden
    if (id === WATER && nId !== AIR) continue;                  // water only shows faces against air
    const mk = materialKey(id, fi);
     // water faces go to the shared world-wide mesh (rebuilt by rebuildWater);
     // solid-block faces stay in this chunk's group as before.
     let b;
     if (mk === 'water') {
       if (!wB) wB = { pos: [], col: [], uv: [], idxArr: [] };
       b = wB;
     } else {
       b = buckets[mk];
       if (!b) b = buckets[mk] = { pos: [], col: [], uv: [], idxArr: [] };
     }
    const base = b.pos.length / 3;
    for (let k = 0; k < 4; k++) {
     b.pos.push(x + f.c[k][0], y + f.c[k][1], z + f.c[k][2]);
     b.col.push(f.b, f.b, f.b);          // baked directional shading
     b.uv.push(f.uv[k][0], f.uv[k][1]);
    }
    b.idxArr.push(base, base + 1, base + 2, base, base + 2, base + 3);
   }
  }

     chunkWater.set(key, wB);   // null if this chunk has no water

 const group = new THREE.Group();
 for (const [mk, data] of Object.entries(buckets)) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  geo.setIndex(data.idxArr);
  group.add(new THREE.Mesh(geo, materials[mk]));
 }
 group.userData.cx = cx;
 group.userData.cz = cz;
 scene.add(group);
 chunkMeshes.set(key, group);
}

function rebuildAllChunks() {
  for (let cz = 0; cz < D / CH; cz++) for (let cx = 0; cx < W / CH; cx++) buildChunk(cx, cz);
  rebuildWater();
}

// Rebuild the chunk containing (x,z) plus edge neighbors when needed.
function rebuildAround(x, z) {
  const set = new Set();
  const add = (cx, cz) => { if (cx >= 0 && cx < W / CH && cz >= 0 && cz < D / CH) set.add(cx + ',' + cz); };
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  add(cx, cz);
  const lx = x - cx * CH, lz = z - cz * CH;
  if (lx === 0) add(cx - 1, cz);
  if (lx === CH - 1) add(cx + 1, cz);
  if (lz === 0) add(cx, cz - 1);
  if (lz === CH - 1) add(cx, cz + 1);
  for (const k of set) { const [a, b] = k.split(','); buildChunk(+a, +b); }
  rebuildWater();   // merge per-chunk water parts into the one world mesh
}

// Distance culling: fog swallows everything past its far plane, so skip drawing
// regions entirely outside that radius (checked per frame - cheap at ~150 regions).
const CULL_DIST = scene.fog.far + CH * 1.6;   // covers a region's half-diagonal with slack
const CULL_D2 = CULL_DIST * CULL_DIST;
// Big map: a region is built the first time it gets close enough to render (the fog hides everything else),
// so walking across the world streams regions in instead of waiting for one giant initial build.
function ensureNearChunks(ax, az) {
 let built = false;
 const nX = W / CH, nZ = D / CH;
 for (let cz = 0; cz < nZ; cz++) for (let cx = 0; cx < nX; cx++) {
   const key = cx + ',' + cz;
   if (chunkMeshes.has(key)) continue;
   const dx = cx * CH + CH / 2 - ax, dz = cz * CH + CH / 2 - az;
   if (dx * dx + dz * dz < CULL_D2) { buildChunk(cx, cz); built = true; }
 }
 if (built) rebuildWater();   // merge the new regions' water parts into the shared world mesh
}

function cullRegions() {
 const px = camera.position.x, pz = camera.position.z;
 for (const g of chunkMeshes.values()) {
  const dx = g.userData.cx * CH + CH / 2 - px, dz = g.userData.cz * CH + CH / 2 - pz;
  g.visible = dx * dx + dz * dz < CULL_D2;
 }
}

// ============================================================ camera & player
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2500);
camera.rotation.order = 'YXZ';

generateWorld();
// NOTE: regions are built lazily around the player (see ensureNearChunks) - the map is now too big to mesh it all up front

function topSolidY(x, z) { for (let y = H - 1; y >= 0; y--) { const b = blocks[idx(x, y, z)]; if (b !== AIR && b !== TALL_GRASS) return y; } return -1; }   // tall grass is walk-through: not "solid" for spawn/mob ground checks

// Find a spawn spot: prefer the map center, spiraling outward until we find
// grass with six clear blocks of headroom (so trees can't spawn inside you).
function findSpawn() {
  const cx = W >> 1, cz = D >> 1;
  for (let r = 0; r <= 9; r++) {
    const cand = [];
    if (r === 0) cand.push([cx, cz]);
    else for (let a = -r; a <= r; a++) cand.push([cx + a, cz + r], [cx + a, cz - r], [cx + r, cz + a], [cx - r, cz + a]);
    for (const [x, z] of cand) {
      if (x < 2 || x >= W - 2 || z < 2 || z >= D - 2) continue;
      const y = topSolidY(x, z);
      if (y < 1 || blockAt(x, y, z) === WATER) continue;   // stay on dry land
      let clear = true;
      for (let dy = 1; dy <= 6; dy++) { const b = blockAt(x, y + dy, z); if (b !== AIR && b !== TALL_GRASS) { clear = false; break; } }   // walk-through grass is not an obstruction
      if (clear) return [x, z];
    }
  }
  return [cx, cz];
}

const spawnXZ = findSpawn();
// fixed in world space: exactly due EAST (bearing 90Â°) from the spawn point
sun.position.set(spawnXZ[0] + 750.5, 380, spawnXZ[1] + 0.5);
ensureNearChunks(spawnXZ[0], spawnXZ[1]);   // build only the regions near the player; the rest stream in as you explore (see animate)
const player = {
  pos: new THREE.Vector3(spawnXZ[0] + 0.5, topSolidY(spawnXZ[0], spawnXZ[1]) + 1 + EYE + 0.02, spawnXZ[1] + 0.5), // eye position
  yaw: Math.PI * 0.78, pitch: -0.12,
  vy: 0, onGround: false,
};

const keys = Object.create(null);
let locked = false;

function collides(p) {
  const minx = p.x - PHALF, maxx = p.x + PHALF;
  const miny = p.y - EYE,    maxy = p.y - EYE + PHEIGHT;
  const bx0 = Math.floor(minx), bx1 = Math.floor(maxx - 1e-7);
  const by0 = Math.floor(miny), by1 = Math.floor(maxy - 1e-7);
  const bz0 = Math.floor(p.z - PHALF), bz1 = Math.floor(p.z + PHALF - 1e-7);
  for (let y = by0; y <= by1; y++)
    for (let z = bz0; z <= bz1; z++)
      for (let x = bx0; x <= bx1; x++)
        if (solidForPhysics(x, y, z)) return true;
  return false;
}

function collidesAt(axis, val) {
  const p = player.pos;
  const saved = p[axis];
  p[axis] = val;
  const hit = collides(p);
  p[axis] = saved;
  return hit;
}

// Move along one axis with binary-search snap-back. Returns true if blocked.
function moveAxis(axis, to) {
  const from = player.pos[axis];
  if (from === to) return false;
  if (!collidesAt(axis, to)) { player.pos[axis] = to; return false; }
  let lo = from, hi = to;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (collidesAt(axis, mid)) hi = mid; else lo = mid;
  }
  player.pos[axis] = lo;
  return true;
}

function syncCamera() {
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

// ============================================================ first-person arm (Minecraft style)
scene.add(camera); // required so the camera's children (the arm) get rendered

// tiny pixel textures for skin + shirt cuff (local rng so world seed is untouched)
function makeArmTex(base, amt) {
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const g = c.getContext('2d');
  let rs = 4242;
  const r = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const img = g.createImageData(8, 8);
  for (let i = 0; i < 64; i++) {
    const o = i * 4;
    img.data[o]     = Math.max(0, Math.min(255, base[0] + (r() * 2 - 1) * amt));
    img.data[o + 1] = Math.max(0, Math.min(255, base[1] + (r() * 2 - 1) * amt));
    img.data[o + 2] = Math.max(0, Math.min(255, base[2] + (r() * 2 - 1) * amt));
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}
// depth test OFF so the hand is always drawn in front of the world (like vanilla MC's separate hand pass)
const skinMat   = new THREE.MeshBasicMaterial({ map: makeArmTex([228, 179, 145], 9),  fog: false, depthTest: false, depthWrite: false, transparent: true }); // in transparent pass (renderOrder) so it draws after water and never gets blended into
const sleeveMat = new THREE.MeshBasicMaterial({ map: makeArmTex([100, 180, 235], 12), fog: false, depthTest: false, depthWrite: false, transparent: true }); // same as skinMat — drawn after water in the transparent pass

// clones of the world materials for the held item (same textures, but never depth-occluded)
const armMats = {};
for (const k in materials) { const m = materials[k].clone(); m.depthTest = false; m.depthWrite = false; m.fog = false; m.transparent = true; m.opacity = 1; armMats[k] = m; } // held item drawn after water too, fully opaque

// the arm: a cuff at the bottom-right corner, a skin forearm, a hand — steep diagonal
// from the corner up toward view center, like vanilla MC (root sits just off-screen)
const armRoot = new THREE.Group();
// point the hand almost straight forward: ~horizontal, tilted 20 deg right of view center and slightly up (like vanilla MC)
const _handYaw = 30 * Math.PI / 180;
const _handElev = 25 * Math.PI / 180; // above horizontal - "almost pointing forward"
const ARM_BASE_Q  = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(Math.sin(_handYaw) * Math.cos(_handElev), Math.sin(_handElev), -Math.cos(_handYaw) * Math.cos(_handElev))
);
const ARM_SWING_Q = new THREE.Quaternion();   // per-frame pitch (swing/bob), applied in camera space on top of base pose
const _AXIS_X     = new THREE.Vector3(1, 0, 0);
armRoot.position.set(0.90, -1.20, -0.9);
camera.add(armRoot); // parent to the camera so it stays fixed in view space

function addArmBox(w, h, d, x, y, z, mat, order) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.renderOrder = order;
  armRoot.add(m);
  return m;
}
addArmBox(0.34, 0.30, 0.34, 0, 0.15, 0,    sleeveMat, 100); // shirt cuff in the corner
addArmBox(0.26, 0.80, 0.26, 0, 0.70, 0,    skinMat,   100); // forearm
addArmBox(0.26, 0.82, 0.26, 0, 0.70, 0.04, skinMat,   100); // hand (slightly toward camera)

// held item — a block in front of the hand, brighter than world faces (hand items get their own light)
let heldMesh = null;
let heldItemId = null;
// the live "readout screen" of a handheld tool: a tool like the Range Rod draws its
// reading onto this canvas each frame, so the number lives on the device, not a HUD panel.
let toolScreenCtx = null, toolScreenTex = null;
function disposeHeld() {
  if (!heldMesh) return;
  armRoot.remove(heldMesh);
  if (heldMesh.geometry) heldMesh.geometry.dispose();
  else for (const ch of heldMesh.children) { if (ch.geometry) ch.geometry.dispose(); if (ch.material && ch.material.map) ch.material.map.dispose(); }
  heldMesh = null; toolScreenCtx = null; toolScreenTex = null;
}
function setHeldItem(id) {
  if (id === heldItemId) return;             // no-op (also covers empty hand -> empty hand)
  heldItemId = id;
  disposeHeld();
  if (!id) return;                           // empty hand, nothing to show
  const info = ITEM_INFO[id];
  if (info && info.tool) { buildToolMesh(id, info); return; }   // a handheld tool, not a placeable block
  const geo = new THREE.BoxGeometry(0.252, 0.252, 0.252); // 40% smaller than before
  const bright = [0.85, 0.72, 1.0, 0.6, 0.95, 0.8]; // +x -x +y -y +z -z
  const col = new Float32Array(72);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const o = (f * 4 + v) * 3; col[o] = col[o + 1] = col[o + 2] = bright[f]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  heldMesh = new THREE.Mesh(geo, [0, 1, 2, 3, 4, 5].map(fi => armMats[materialKey(id, fi)]));
  heldMesh.position.set(0.16, 1.35, 0.18); // just past the fingertips, slightly toward camera
  heldMesh.renderOrder = 101;
  armRoot.add(heldMesh);
}
// ---- tool pattern: a handheld device the player earns from a helper NPC. The first is the
// Range Rod (measurement). Future legibility surfaces should follow the same shape — an item
// tagged `tool: <name>`, a device mesh built here, and an update that acts while it is held.
function buildToolMesh(id, info) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false, depthTest: false, depthWrite: false, transparent: true });
  const part = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.renderOrder = 101; g.add(b); return b; };
  part(0.26, 0.16, 0.30, 0, 0, 0,           mat(0x39404e));   // body
  part(0.12, 0.24, 0.12, 0, -0.16, 0.03,    mat(0x272c34));   // grip under the body
  const sc = document.createElement('canvas'); sc.width = sc.height = 32;
  toolScreenCtx = sc.getContext('2d');
  toolScreenTex = toTexture(sc);
  part(0.20, 0.10, 0.03, 0, 0.11, 0.11, new THREE.MeshBasicMaterial({ map: toolScreenTex, fog: false, depthTest: false, depthWrite: false, transparent: true })); // readout screen
  g.position.set(0.16, 1.30, 0.16);
  g.renderOrder = 101;
  heldMesh = g;
  armRoot.add(g);
}
// survival: the hand starts empty - items only come from what you mine (or a helper hands you a tool)
heldItemId = null;

// ---- arm animation: mining swing, break strike, place poke, walk bob + idle breathing
let mineT = 0, breakAnimT = 99, placeAnimT = 99, armBobPhase = 0, armClock = 0;
function triggerArmSwing(kind) { if (kind === 'break') breakAnimT = 0; else placeAnimT = 0; }

const ARM_BASE_Y = -1.20;
function updateArm(dt) {
  armRoot.visible = locked; // hidden in menus, like vanilla
  if (!locked) return;
  armClock += dt;

  const mv = player._moveAmt || 0;
  armBobPhase += mv * 2.9;
  const speedF = Math.min(1, mv / 0.055);
  const bobY = Math.sin(armBobPhase) * 0.024 * speedF + Math.sin(armClock * 1.6) * 0.005;

  let swingX = -0.05; // slight resting tilt
  if (mouseState.left || eatHeld) {   // mining OR eating share the same continuous hand swing
    mineT += dt;
    swingX += 0.44 * Math.sin(mineT * 23.5) + 0.12;   // continuous mining swing ~3.7 Hz
  } else mineT = 0;
  if (breakAnimT < 0.16) { breakAnimT += dt; swingX -= 0.8 * Math.sin(Math.PI * breakAnimT / 0.16); }  // quick strike down
  if (placeAnimT < 0.12) { placeAnimT += dt; swingX -= 0.5 * Math.sin(Math.PI * placeAnimT / 0.12); }  // short poke forward

    const swingTotal = swingX + Math.sin(armBobPhase) * 0.03 * speedF + ((mouseState.left || eatHeld) ? 0.05 * Math.sin(mineT * 23.5 + 1.3) : 0);
    armRoot.quaternion.copy(ARM_SWING_Q.setFromAxisAngle(_AXIS_X, swingTotal)).multiply(ARM_BASE_Q);
  armRoot.position.y = ARM_BASE_Y + bobY;
}

// ============================================================ voxel raycast (Amanatides & Woo DDA)
function raycastVoxel(origin, dir, maxDist = REACH) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const hitSolid = (bx, by, bz) => { const id = blockAt(bx, by, bz); return id !== AIR && id !== WATER; };
  if (hitSolid(x, y, z)) return { x, y, z, nx: 0, ny: 1, nz: 0 }; // started inside a solid block

  const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
  const tDX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tMaxX = dir.x > 0 ? (x + 1 - origin.x) * tDX : dir.x < 0 ? (origin.x - x) * tDX : Infinity;
  let tMaxY = dir.y > 0 ? (y + 1 - origin.y) * tDY : dir.y < 0 ? (origin.y - y) * tDY : Infinity;
  let tMaxZ = dir.z > 0 ? (z + 1 - origin.z) * tDZ : dir.z < 0 ? (origin.z - z) * tDZ : Infinity;

    // cap raised 256->1024 so the measure tool's long look (300 blocks) reaches far
    // terrain; mining uses maxDist=6 and returns via the tMax>maxDist check long before
    // the cap, so gameplay is unaffected.
  for (let i = 0; i < 1024; i++) {
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      if (tMaxX > maxDist) return null;
      const px = x, py = y, pz = z;   // cell we're leaving = placement target
      x += stepX; tMaxX += tDX;
      if (hitSolid(x, y, z)) return { x, y, z, nx: px - x, ny: 0, nz: 0 };
    } else if (tMaxY <= tMaxZ) {
      if (tMaxY > maxDist) return null;
      const px = x, py = y, pz = z;
      y += stepY; tMaxY += tDY;
      if (hitSolid(x, y, z)) return { x, y, z, nx: 0, ny: py - y, nz: 0 };
    } else {
      if (tMaxZ > maxDist) return null;
      const px = x, py = y, pz = z;
      z += stepZ; tMaxZ += tDZ;
      if (hitSolid(x, y, z)) return { x, y, z, nx: 0, ny: 0, nz: pz - z };
    }
  }
  return null;
}

// ============================================================ block interaction
function doBreak(hit) {
  if (!hit || hit.y <= 0) return false;   // keep the base layer unbreakable
  const id = blockAt(hit.x, hit.y, hit.z);
  setBlockRaw(hit.x, hit.y, hit.z, AIR);
  rebuildAround(hit.x, hit.z);
  if (id !== TALL_GRASS) spawnDrop(hit.x + 0.5, hit.y + 0.35, hit.z + 0.5, id);   // survival: it drops to the ground (tall grass drops nothing)
  SFX.breakBlock(id);
  triggerArmSwing('break');
  return true;
}

function aabbOverlapsCell(bx, by, bz) {
  const p = player.pos;
  return bx + 1 > p.x - PHALF && bx < p.x + PHALF &&
         by + 1 > p.y - EYE    && by < p.y - EYE + PHEIGHT &&
         bz + 1 > p.z - PHALF && bz < p.z + PHALF;
}

function doPlace(hit) {
  if (!hit) return false;
  const st = inventory[selIndex];
  if (!st || !ITEM_INFO[st.id] || ITEM_INFO[st.id].noPlace) return false;   // empty hand / non-placeable item (meat etc.)
  const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
  if (!inBounds(tx, ty, tz)) return false;
  { const cur = blockAt(tx, ty, tz); if (cur !== AIR && cur !== WATER) return false; } // solids may displace water
  if (aabbOverlapsCell(tx, ty, tz)) return false; // don't place inside yourself
  setBlockRaw(tx, ty, tz, st.id);
  rebuildAround(tx, tz);
  SFX.place(st.id);
  removeOneSelected();                          // one block out of the hand per placement
  triggerArmSwing('place');
  return true;
}

function aimHit() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return raycastVoxel(camera.position, dir);
}

// ============================================================ hold-to-mine (progress + crack overlay)
const BREAK_TIME = { [GRASS]: 0.7, [DIRT]: 0.5, [STONE]: 1.4, [WOOD]: 1.0, [LEAVES]: 0.35, [SAND]: 0.4, [CACTUS]: 0.6, [TALL_GRASS]: 0.005 };   // tall grass breaks instantly (first frame of the hold)

const CRACK_STAGES = 10;
// Blocky pixelated cracks like real Minecraft: an 8x8 grid of 2px cells on a
// 16x16 canvas (NearestFilter => hard pixels). Cracks are axis-aligned random
// walks seeded ONCE, so every stage draws the same pattern with more of it.
function makeCrackTexture(stage) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  let rs = 1337;
  const r = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const CELL = 2, GRID = 8;                        // 8x8 cells of 2px on a 16px canvas
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // cardinal steps only => blocky lines
  const spines = [];
  const N_CRACKS = 8;
  for (let i = 0; i < N_CRACKS; i++) {
    let x = 3 + Math.floor(r() * 2), y = 3 + Math.floor(r() * 2);   // start near center
    const cells = [[x, y]];
    const steps = 6 + Math.floor(r() * 5);
    let dir = -1;
    for (let k = 0; k < steps; k++) {              // zigzagging random walk outward
      let d;
      do { d = DIRS[Math.floor(r() * 4)]; }
      while (dir >= 0 && r() < 0.6 && d[0] === DIRS[dir][0] && d[1] === DIRS[dir][1]);
      dir = DIRS.indexOf(d);
      x = Math.max(0, Math.min(GRID - 1, x + d[0]));
      y = Math.max(0, Math.min(GRID - 1, y + d[1]));
      cells.push([x, y]);
    }
    spines.push(cells);
  }

  // each stage reveals a growing fraction of EVERY crack at once (like MC's stages)
  const f = (stage + 1) / CRACK_STAGES;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (const cells of spines) {
    const n = Math.min(cells.length, Math.max(1, Math.round(cells.length * f)));
    for (let k = 0; k < n; k++) g.fillRect(cells[k][0] * CELL, cells[k][1] * CELL, CELL, CELL);
  }

  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
const crackMats = Array.from({ length: CRACK_STAGES }, (_, i) =>
  new THREE.MeshBasicMaterial({ map: makeCrackTexture(i), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
// slightly larger cube so the crack texture is drawn on ALL SIX faces of the block
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMats[0]);
crackMesh.visible = false;
crackMesh.renderOrder = 10;
scene.add(crackMesh);

let mining = null;   // { x, y, z, id }
let miningT = 0;     // 0..1 progress on the current target
let crackStage = -1;

function hideCracks() {
  crackMesh.visible = false;
  crackStage = -1;
}

function updateMining(dt) {
  if (!locked || !mouseState.left) { mining = null; miningT = 0; hideCracks(); return; }
  const hit = aimHit();
  const id = hit ? blockAt(hit.x, hit.y, hit.z) : AIR;
  const canBreak = !!hit && id !== AIR && hit.y > 0;   // base layer stays unbreakable
  if (!canBreak || !mining || mining.x !== hit.x || mining.y !== hit.y || mining.z !== hit.z
      || blockAt(mining.x, mining.y, mining.z) !== mining.id) {
    mining = canBreak ? { x: hit.x, y: hit.y, z: hit.z, id } : null;
    miningT = 0;
  }
  if (!mining) { hideCracks(); return; }

  miningT += dt / (BREAK_TIME[mining.id] || 1);
  if (miningT >= 1) {
    doBreak(mining);
    mouseState.lastAct = performance.now();
    mining = null; miningT = 0; hideCracks();
    return;
  }

  // center the crack cube on the block being mined (cracks show on every face)
  crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  const stage = Math.min(CRACK_STAGES - 1, Math.floor(miningT * CRACK_STAGES));
  if (stage !== crackStage) { crackMesh.material = crackMats[stage]; crackStage = stage; SFX.mineTick(mining.id, stage, CRACK_STAGES); }
  crackMesh.visible = true;
}

// ============================================================ survival inventory
// The hotbar IS the whole bag for now: 8 slots, stacks up to 64. You spawn with
// an empty hand; mine a block and it drops on the ground - pick it up to stack it here.
const INV_SIZE = 8, STACK_MAX = 64;
const ITEM_INFO = {
  [GRASS]:  { name: 'Grass', tex: 'grassSide' },
  [DIRT]:   { name: 'Dirt',  tex: 'dirt' },
  [STONE]:  { name: 'Stone', tex: 'stone' },
  [WOOD]:   { name: 'Wood',  tex: 'woodSide' },
  [LEAVES]: { name: 'Leaves',tex: 'leaves' },
  [SAND]:   { name: 'Sand',  tex: 'sand' },
    [MEAT]:   { name: 'Meat',  tex: 'meat', noPlace: true },
    [CACTUS]: { name: 'Cactus', tex: 'cactus' },
     [RANGE_ROD]: { name: 'Range Rod', tex: 'rangeRod', noPlace: true, tool: 'measure' },
};

const inventory = new Array(INV_SIZE).fill(null);    // slot -> null | { id, count }
let selIndex = 0;

function addItem(id, n) {                            // returns true if everything fit in the bag
  if (!ITEM_INFO[id]) return false;                  // unstackable (water etc.) - not pickable
  let left = (n === undefined ? 1 : n);
  for (let i = 0; i < INV_SIZE && left > 0; i++) {   // top up existing stacks first
    const st = inventory[i];
    if (st && st.id === id && st.count < STACK_MAX) {
      const a = Math.min(STACK_MAX - st.count, left); st.count += a; left -= a;
    }
  }
  for (let i = 0; i < INV_SIZE && left > 0; i++)     // then open slots
    if (!inventory[i]) { const a = Math.min(STACK_MAX, left); inventory[i] = { id, count: a }; left -= a; }
  renderInventory(); updateHeldItem();   // refresh held item (picked up into the selected slot?)
  return left === 0;
}

function removeOneSelected() {                        // one block out of the held slot (placing)
  const st = inventory[selIndex];
  if (!st) return;
  st.count--;
  if (st.count <= 0) inventory[selIndex] = null;
  renderInventory(); updateHeldItem();
}
function hasItem(id) { for (const st of inventory) if (st && st.id === id) return true; return false; }

function updateHeldItem() { setHeldItem(inventory[selIndex] ? inventory[selIndex].id : null); }

// ---- hotbar DOM: one canvas + stack count per slot, built once and redrawn on change
const hotbarEl = document.getElementById('hotbar');
const slotEls = [];
for (let i = 0; i < INV_SIZE; i++) {
  const s = document.createElement('div'); s.className = 'slot';
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const cnt = document.createElement('span'); cnt.className = 'count';
  s.append(c, cnt);
  hotbarEl.appendChild(s);
  slotEls.push({ el: s, canvas: c, count: cnt });
}
let blankTile;      // precomputed transparent 16x16 tile to clear slot canvases with
function renderInventory() {
  if (!blankTile) { const bc = document.createElement('canvas'); bc.width = bc.height = 16; blankTile = bc.getContext('2d').createImageData(16, 16); }
  for (let i = 0; i < INV_SIZE; i++) {
    const st = inventory[i];
    const g = slotEls[i].canvas.getContext('2d');
    g.putImageData(blankTile, 0, 0);
    if (st) {
      g.drawImage(texCanvases[ITEM_INFO[st.id].tex], 0, 0);
      slotEls[i].count.textContent = st.count > 1 ? st.count : '';
    } else slotEls[i].count.textContent = '';
  }
}

const selnameEl = document.getElementById('selname');
function selectSlot(i) {
  selIndex = ((i % INV_SIZE) + INV_SIZE) % INV_SIZE;
  slotEls.forEach((s, k) => s.el.classList.toggle('selected', k === selIndex));
  const st = inventory[selIndex];
  selnameEl.textContent = st ? ITEM_INFO[st.id].name : '\u00A0';   // nbsp keeps the layout height stable
  selnameEl.classList.remove('pop'); void selnameEl.offsetWidth; selnameEl.classList.add('pop');
  renderInventory(); updateHeldItem();
}

// ============================================================ hearts HUD + damage
const MAX_HEALTH = 20, HEART_COUNT = 10;      // each heart is worth 2 health (like vanilla)
let health = MAX_HEALTH;
let hurtFlashT = 0;                           // >0 while the red "hit" vignette fades out

const HEART_ROWS = [                          // pixel heart, 9x7
  '.##...##.',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
];
function drawHeart(canvas, frac) {            // frac: 0 (empty) .. 1 (full) heart of 2 HP
  const px = 4;                               // texel scale -> 36x28 canvas
  if (canvas.width !== HEART_ROWS[0].length * px || canvas.height !== HEART_ROWS.length * px) {
    canvas.width = HEART_ROWS[0].length * px; canvas.height = HEART_ROWS.length * px;
  }
  const g = canvas.getContext('2d');
  for (let y = 0; y < HEART_ROWS.length; y++) {
    const row = HEART_ROWS[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let on;
      if (frac >= 1) on = true;
      else if (frac <= 0.02) on = false;
      else on = x < 4;                        // half heart: left lobe lit, right side dark
      g.fillStyle = on ? '#e6392f' : '#3d1e1c';
      g.fillRect(x * px, y * px, px, px);
    }
  }
}
const heartsEl = document.getElementById('hearts');
const heartCanvases = [];
for (let i = 0; i < HEART_COUNT; i++) { const hc = document.createElement('canvas'); heartsEl.appendChild(hc); heartCanvases.push(hc); }
function renderHearts() {
  for (let i = 0; i < HEART_COUNT; i++) drawHeart(heartCanvases[i], Math.max(0, Math.min(2, health - i * 2)) / 2);
}
renderHearts();

// ---- hunger HUD (placeholder: always full, no gameplay effect yet)
const HUNGER_COUNT = 10;
const MEAT_ROWS = [                          // pixel drumstick, 8x7 (M meat, B bone)
  '......B.',
  '.MMM.BBB',
  'MMMMMM..',
  '.MMMMMM.',
  '.MMMMMM.',
  '..MMMM..',
  '...MM...',
];
function drawMeat(canvas, lit = true) {
  const px = 4;                              // texel scale -> 32x28 canvas
  canvas.width = MEAT_ROWS[0].length * px; canvas.height = MEAT_ROWS.length * px;
  const g = canvas.getContext('2d');
  for (let y = 0; y < MEAT_ROWS.length; y++) {
    const row = MEAT_ROWS[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = lit ? (ch === 'B' ? '#e8ddbf' : '#cf7c2a') : '#3d3d44';   // dimmed slot when that bar is empty
      g.fillRect(x * px, y * px, px, px);
    }
  }
}
const hungerEl = document.getElementById('hunger');
for (let i = 0; i < HUNGER_COUNT; i++) {
  const mc = document.createElement('canvas'); drawMeat(mc); hungerEl.appendChild(mc);
}

// ---- oxygen HUD (MC-style bubbles above the hunger row, shown only while submerged)
const OXYGEN_MAX = 10;
let oxygen = OXYGEN_MAX;      // remaining bubbles (integer, like vanilla)
let o2DrainT = 0;             // accumulator: drops one bubble per interval
let drownDmgT = 0;            // out-of-air damage timer
const BUBBLE_ROWS = [          // pixel bubble, 9x7 (H=highlight sparkle)
'.#######.',
'#HH#####.',
'#.####..#',
'#.......#',
'#...##..#',
'#.......#',
'.#######.'
];
function drawBubble(canvas, lit) {
  const px = 4;                // -> 36x28 canvas, same as hearts/hunger row icons
  if (canvas.width !== BUBBLE_ROWS[0].length * px || canvas.height !== BUBBLE_ROWS.length * px) { canvas.width = BUBBLE_ROWS[0].length * px; canvas.height = BUBBLE_ROWS.length * px; }
  const g = canvas.getContext('2d');
  for (let y = 0; y < BUBBLE_ROWS.length; y++) { const row = BUBBLE_ROWS[y]; for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === '.') continue;
    g.fillStyle = ch === 'H' ? '#eaf7ff' : (lit ? '#63c6ff' : '#2b3a49');   // lit bubble vs empty slot
    g.fillRect(x * px, y * px, px, px); } }
}
const oxygenEl = document.getElementById('oxygen');
const bubbleCanvases = [];
for (let i = 0; i < OXYGEN_MAX; i++) { const bc = document.createElement('canvas'); drawBubble(bc, true); oxygenEl.appendChild(bc); bubbleCanvases.push(bc); }
function renderOxygen() { for (let i = 0; i < OXYGEN_MAX; i++) drawBubble(bubbleCanvases[i], i < oxygen); }
renderOxygen();

const O2_DRAIN_SEC = 1, DROWN_SEC = 1;   // one bubble every second (doubled drain vs. before); once empty: one heart of damage per second
function updateOxygen(dt) {
  const headBlock = blockAt(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
  const sub = locked && headBlock === WATER;   // fully under water (head below surface); hidden in menus like the arm
  oxygenEl.classList.toggle('show', sub);
  if (!sub) { if (oxygen !== OXYGEN_MAX) { oxygen = OXYGEN_MAX; o2DrainT = 0; drownDmgT = 0; renderOxygen(); } return; }   // refill on the surface, like vanilla's fast recovery
  o2DrainT += dt;
  let changed = false;
  while (o2DrainT >= O2_DRAIN_SEC && oxygen > 0) { o2DrainT -= O2_DRAIN_SEC; oxygen--; changed = true; }   // count down one bubble at a time
  if (changed) renderOxygen();
  if (oxygen <= 0) { drownDmgT += dt; while (drownDmgT >= DROWN_SEC && health > 0) { drownDmgT -= DROWN_SEC; takeDamage(2); SFX.hurt(); } }   // 2 HP = one heart per second (with a hurt oof)
}
  // ---- hunger: drains over time, faster when moving / sprinting; refilled by eating meat
  const HUNGER_MAX = 10;                       // one bar per unit (== HUNGER_COUNT icons)
  let hunger = HUNGER_MAX;                     // fractional 0..HUNGER_MAX -> bars drop off one by one as it falls
  const HUNGER_DRAIN = { idle: HUNGER_MAX/3600, walk: HUNGER_MAX/1200, run: HUNGER_MAX/600 };   // full->empty in ~1h / ~20min / ~10min
  let hungerMode = 'idle';                     // set each frame from stepPhysics based on actual movement
  
  function renderHunger() { for (let i = 0; i < HUNGER_COUNT; i++) drawMeat(hungerEl.children[i], i < hunger); }
  function updateHunger(dt) {
    if (!locked || health <= 0) return;
    const before = hunger;
    hunger = Math.max(0, hunger - HUNGER_DRAIN[hungerMode] * dt);
    if (Math.floor(before) !== Math.floor(hunger)) renderHunger();   // repaint only when a bar crosses an integer boundary
  }
  
  // ---- eating meat: hold right-click for EAT_TIME while holding meat in the selected slot -> +EAT_GAIN bars
  const EAT_TIME = 1.5, EAT_GAIN = 2;
  let eatT = 0;                                // seconds of continuous hold so far
  let munchT = 0;                              // cadence timer for the repeated chewing sounds while holding food
  const MUNCH_INTERVAL = 0.2;                  // one chew bite every ~0.2s -> ~8 chews over a full 1.5s eat
  let eatHeld = false;                         // drives the arm's "eating" hand swing in updateArm
  function updateEat(dt) {
    if (!locked || health <= 0) { eatT = 0; munchT = 0; eatHeld = false; return; }
    const st = inventory[selIndex];
    const canEat = mouseState.right && st && st.id === MEAT && hunger < HUNGER_MAX - 1e-6;   // holding meat and not already full
    if (canEat) {
      eatHeld = true;                          // swing the hand just like while mining / breaking blocks
      eatT += dt;
      munchT += dt;                            // chew continuously WHILE holding, so you hear it as it happens
      while (munchT >= MUNCH_INTERVAL) { munchT -= MUNCH_INTERVAL; SFX.chew(); }
      if (eatT >= EAT_TIME) {
        hunger = Math.min(HUNGER_MAX, hunger + EAT_GAIN); renderHunger();
        removeOneSelected();                   // consume one meat from the held slot (updates hand + hotbar)
        triggerArmSwing('break');              // a little strike as it lands in your mouth
        eatT = 0; munchT = 0;
      }
    } else { eatT = 0; munchT = 0; eatHeld = false; }
  }

  
const hurtEl = document.getElementById('hurt');
function takeDamage(n) {
  if (health <= 0) return;
  health = Math.max(0, health - n);
  hurtFlashT = 0.5;
  renderHearts();
  if (health <= 0) die();
}

const deadEl = document.getElementById('deadmsg');
function respawnPlayer() {
  const [rx, rz] = findSpawn();
  player.pos.set(rx + 0.5, topSolidY(rx, rz) + 1 + EYE + 0.02, rz + 0.5);
  player.vy = 0;
}
function die() {
  deadEl.classList.remove('show'); void deadEl.offsetWidth; deadEl.classList.add('show');
  health = MAX_HEALTH; renderHearts();        // respawn at full (items kept - keep it friendly)
  respawnPlayer();
  syncCamera();
}

// ============================================================ item drops (ground pickups)
const dropGeo = (() => {
  const g = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const bright = [0.9, 0.76, 1.0, 0.65, 0.98, 0.85];   // +x -x +y -y +z -z (item-ish lighting)
  const col = new Float32Array(72);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const o = (f * 4 + v) * 3; col[o] = col[o+1] = col[o+2] = bright[f]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
const dropMatsCache = {};                     // id -> per-face material array (shared by every drop of that block)
function dropMats(id) { return dropMatsCache[id] ??= [0,1,2,3,4,5].map(fi => materials[materialKey(id, fi)]); }

const drops = [];                             // { x,y,z, vy, rest, age, id, mesh }
const MAX_DROPS = 512;
function spawnDrop(x, y, z, id) {
  if (!ITEM_INFO[id]) return;                 // unstackable blocks just vanish
  if (drops.length >= MAX_DROPS) removeDrop(0);   // oldest despawns - keeps memory bounded
  const mesh = new THREE.Mesh(dropGeo, dropMats(id));
  scene.add(mesh);
  drops.push({ x, y, z, vy: -1.5, rest: false, age: 0, id, mesh });
}
function removeDrop(i) {
  const d = drops[i]; if (!d) return;
  scene.remove(d.mesh);                       // geometry + materials are shared - never dispose here
  drops.splice(i, 1);
}
function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.age += dt;

    // pickup: drop near the player's mid-body AND room in the bag -> add it
    const fx = player.pos.x, fy = player.pos.y - EYE + 0.5, fz = player.pos.z;
    let dxp = fx - d.x, dyp = fy - d.y, dzp = fz - d.z;
    const dist = Math.hypot(dxp, dyp, dzp);
    if (dist < 1.3) { if (addItem(d.id)) removeDrop(i); continue; }

    if (!d.rest) {
      // fall under gravity until something solid catches us
      d.vy -= GRAVITY * dt; if (d.vy < -30) d.vy = -30;
      const ny = d.y + d.vy * dt;
      const bx = Math.floor(d.x), bz = Math.floor(d.z);
      const byCell = Math.floor(ny - 0.14);
      if (d.vy < 0 && solidForPhysics(bx, byCell, bz)) {
        let sy = Math.min(H - 2, Math.floor(d.y - 0.14));
        for (; sy > 0 && !solidForPhysics(bx, sy, bz); sy--);   // nearest support below us
        d.y = sy + 1 + 0.15;                               // sit on top of that solid block
        d.vy = 0; d.rest = true;
      } else d.y = ny;
    } else if (d.age > 1.2 && dist < 3.4) {
      // settled for a moment: drift gently toward the player until pickup range
      const sp = Math.min(dist, 7 * dt);
      d.x += dxp / dist * sp; d.y += dyp / dist * sp; d.z += dzp / dist * sp;
    }

    d.mesh.position.set(d.x, d.y + (d.rest ? Math.sin(d.age * 2.8 + i) * 0.04 : 0), d.z);  // classic idle bob
    d.mesh.rotation.y += dt * 1.7;
  }
}

// red vignette flash when taking damage
let lastHurtOpacity = -1;
function updateHurtFlash(dt) {
  if (hurtFlashT > 0) hurtFlashT -= dt;
  const o = Math.max(0, Math.min(1, hurtFlashT / 0.5)) * 0.8;
  if (o !== lastHurtOpacity) { hurtEl.style.opacity = String(o); lastHurtOpacity = o; }
}

// ============================================================ input
// ============================================================ mobs (friendly passives: cow, sheep, chicken)
const MOBS = [];
const _mv = new THREE.Vector3();   // reused view-direction vector

const MOB_TYPES = {
  cow:     { w:0.9,  h:1.5, len:1.7, half:0.42, hp:24, jump:4.2, speed:[1.1,2.1], meat:3, bodyC:0xded2bd, headC:0xb0946f },
  sheep:   { w:0.85, h:1.2, len:1.3, half:0.40, hp:18, jump:5.0, speed:[1.0,1.9], meat:2, bodyC:0xf1ece0, headC:0xcbb48f },
  chicken: { w:0.5,  h:0.7, len:0.6, half:0.26, hp:8,  jump:7.0, speed:[1.3,2.5], meat:1, bodyC:0xf3d24b, headC:0xe9c23e },
};

function makeMobMesh(type) {
  const T = MOB_TYPES[type];
  const g = new THREE.Group();
  const parts = [];   // every coloured box we can flash on a hit
  const addBox = (w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z); g.add(m); parts.push({ m, base: c }); return m;
  };

  // ---- cow: two-tone body (cream belly / dark brown back), head with snout, ears, eyes, hooves and a tail
  if (type === 'cow') {
    const patch = 0x6e4f33;                                     // the dark coat patches
    for (const [ox, oz] of [[-0.26,-0.48],[0.26,-0.48],[-0.26,0.48],[0.26,0.48]]) {  // four legs + hooves
      addBox(0.18, 0.56, 0.18, ox, 0.34, oz, 0xa78a5f);
      addBox(0.20, 0.10, 0.20, ox, 0.07, oz, 0x322b24);
    }
    addBox(0.86, 0.54, T.len * 0.72, 0, 0.62, 0, T.bodyC);      // lower torso (cream)
    addBox(0.90, 0.30, T.len * 0.75, 0, 1.00, 0, patch);        // back band (brown)
    addBox(0.92, 0.26, 0.45,   0, 0.66, -0.20, patch);          // flank patch
    addBox(0.40, 0.36, 0.40,   0, 1.10, 0.85, T.headC);         // head (meets the body -> neck)
    addBox(0.30, 0.18, 0.14,   0, 0.96, 1.08, 0xd9c39a);        // light snout on the front
    for (const sx of [-1, 1]) {                                 // ears + eyes
      addBox(0.10, 0.12, 0.22, sx * 0.25, 1.26, 0.80, patch);
      addBox(0.05, 0.09, 0.06, sx * 0.21, 1.13, 0.98, 0x201a15);
    }
    addBox(0.05, 0.34, 0.07,   0, 1.02, -0.76, patch);          // tail
    addBox(0.10, 0.16, 0.12,   0, 0.80, -0.79, 0x3a2d1e);       // dark tail tuft
  }

  // ---- sheep: lumpy wool (several same-colour boxes for a clumpy silhouette), short tan legs, small face with ears + eyes
  else if (type === 'sheep') {
    const fleece = T.bodyC;                                     // the fluffy white coat
    for (const [ox, oz] of [[-0.24,-0.34],[0.24,-0.34],[-0.24,0.34],[0.24,0.34]]) {   // four legs + hooves
      addBox(0.16, 0.40, 0.16, ox, 0.20, oz, 0xa98a63);
      addBox(0.17, 0.08, 0.17, ox, 0.05, oz, 0x3d342b);
    }
    addBox(0.72, 0.56, T.len * 0.68, 0, 0.64, 0, fleece);       // main wool mass
    addBox(0.78, 0.16, 0.34,         0, 0.95, -0.20, fleece);   // lumps along the back...
    addBox(0.78, 0.16, 0.34,         0, 0.95,  0.20, fleece);   // ...and rump
    for (const sx of [-1, 1])                                   // fluffs down the sides -> rounded look
      addBox(0.14, 0.44, 0.60, sx * 0.40, 0.60, 0, fleece);
    addBox(0.28, 0.30, 0.30,   0, 0.92, 0.60, T.headC);         // small tan head
    addBox(0.30, 0.10, 0.18,   0, 1.09, 0.50, fleece);          // wool tuft on the crown
    for (const sx of [-1, 1]) {                                 // droopy ears + eyes
      addBox(0.16, 0.07, 0.20, sx * 0.19, 0.94, 0.58, 0xb3946a);
      addBox(0.04, 0.08, 0.05, sx * 0.148, 0.95, 0.62, 0x201a15);
    }
  }

  // ---- chicken: plump body with wings and a fanned tail, tiny legs & feet, head with three-bump comb, two-part beak, wattle and eyes
  else if (type === 'chicken') {
    const accent = 0xcfa12f;                                    // deeper gold for wing / tail feathers
    for (const sx of [-1, 1]) {                                 // thin legs + little feet
      addBox(0.05, 0.16, 0.05, sx * 0.09, 0.08, 0.02, 0xd8a44a);
      addBox(0.05, 0.03, 0.14, sx * 0.09, 0.015, 0.07, 0xd8a44a);
    }
    addBox(0.44, 0.30, T.len * 0.60, 0, 0.32, -0.03, T.bodyC);  // plump body
    for (const sx of [-1, 1])                                   // wings hugging the sides
      addBox(0.05, 0.18, 0.26, sx * 0.245, 0.35, -0.04, accent);
    addBox(0.30, 0.12, 0.16,   0, 0.47, -0.26, T.bodyC);        // fanned tail (lower + upper feather)
    addBox(0.20, 0.10, 0.12,   0, 0.55, -0.24, accent);
    addBox(0.20, 0.19, 0.20,   0, 0.57, 0.24, T.headC);         // head (overlaps the chest -> neck)
    addBox(0.06, 0.11, 0.06,   0, 0.71, 0.20, 0xe23b2e);        // comb: tall centre bump...
    for (const sx of [-1, 1]) addBox(0.05, 0.08, 0.05, sx * 0.055, 0.69, 0.20, 0xe23b2e);   // ...+ two smaller
    addBox(0.10, 0.045, 0.12,  0, 0.585, 0.40, 0xf2a93b);       // beak (upper...
    addBox(0.07, 0.035, 0.10,  0, 0.545, 0.39, 0xf2a93b);       // ...+ lower part)
    addBox(0.05, 0.06, 0.04,   0, 0.50, 0.36, 0xe23b2e);        // little red wattle under the beak
    for (const sx of [-1, 1]) addBox(0.035, 0.07, 0.045, sx * 0.108, 0.60, 0.30, 0x201a15); // eyes
  }

  g.userData.parts = parts;
  return g;
}

function addMob(type, x, y, z) {
  const T = MOB_TYPES[type];
  const group = makeMobMesh(type);
  group.position.set(x, y, z);
  scene.add(group);
  MOBS.push({
    type, pos: new THREE.Vector3(x, y, z), vy: 0,
    dirAngle: Math.random() * Math.PI * 2, speed: 0, faceYaw: 0,
    half: T.half, radius: Math.max(T.w, T.len) / 2 + 0.18, height: T.h, meat: T.meat,
    hp: T.hp, alive: true, airborne: false, hitT: 0, wanderT: Math.random() * 2, idleT: 0, group, parts: group.userData.parts,
  });
}

function spawnMobs(count) {
  const types = ['cow', 'sheep', 'chicken'];
  // scatter over most of the map, not just one corner around the player spawn
  const spread = Math.min(150, W / 2 - 6);
  let made = 0, tries = 0;
  while (made < count && tries < count * 400) {   // wide area + land-only filter means lots of rejects
    tries++;
    const tx = Math.floor(spawnXZ[0] + (Math.random() * 2 - 1) * spread);
    const tz = Math.floor(spawnXZ[1] + (Math.random() * 2 - 1) * spread);
    if (!inBounds(tx, 3, tz)) continue;
    const hgt = topSolidY(tx, tz);
    if (hgt < WL + 1) continue;                                  // land only, above the water level
    const surf = blockAt(tx, hgt, tz);
    if (surf !== GRASS && surf !== DIRT && surf !== SAND) continue;   // dry ground
    let crowded = false;                                         // keep a minimum distance apart -> no herds in one spot
    for (const o of MOBS) if (o.alive && Math.abs(o.pos.x - (tx + 0.5)) < 14 && Math.abs(o.pos.z - (tz + 0.5)) < 14) { crowded = true; break; }
    if (crowded) continue;
    addMob(types[made % types.length], tx + 0.5, hgt + 1 + 0.02, tz + 0.5);
    made++;
  }
}

function killMob(m) {
  if (!m.alive) return;
  m.alive = false;
  scene.remove(m.group);
  for (const ch of m.group.children) ch.geometry.dispose();
  // drop its meat - falls to the ground and can be picked up like any other item
  for (let i = 0; i < m.meat; i++)
    spawnDrop(m.pos.x + (Math.random() - 0.5) * 0.8, m.pos.y + 0.4, m.pos.z + (Math.random() - 0.5) * 0.8, MEAT);
}

// would standing at (x,z) clip a wall/tree or step into the water?
function mobBlocked(m, x, z) {
  const r = m.half;
  for (const [ox, oz] of [[-r,-r],[r,-r],[-r,r],[r,r]]) {
    const bx = Math.floor(x + ox), bz = Math.floor(z + oz);
    if (!inBounds(bx, 0, bz)) return true;                       // treat the map edge as a wall
    // a one-block step up is climbable (the vertical easing below handles it) - only higher terrain blocks
    const climbsOver = topSolidY(bx, bz) + 1 > m.pos.y + 1.05;
    if ((solidForPhysics(bx, Math.floor(m.pos.y + 0.2), bz) || solidForPhysics(bx, Math.floor(m.pos.y + m.height * 0.5), bz)) && climbsOver) return true;
  }
  if (blockAt(Math.floor(x), Math.floor(m.pos.y), Math.floor(z)) === WATER) return true;   // don't wade in
  return false;
}

function updateMobs(dt) {
  for (const m of MOBS) {
    if (!m.alive) continue;

    // pick a heading: wander around, pausing now and then to stand still
    m.wanderT -= dt;
    if (m.idleT > 0) { m.idleT -= dt; m.speed = 0; }
    else if (m.wanderT <= 0) {
      if (Math.random() < 0.12) m.idleT = 0.4 + Math.random() * 1.6;   // shorter, rarer pauses -> more on the move
      else {
        m.dirAngle = Math.random() * Math.PI * 2;
        const T = MOB_TYPES[m.type];
        m.speed = T.speed[0] + Math.random() * (T.speed[1] - T.speed[0]);
        m.wanderT = 3 + Math.random() * 5;   // longer walks before re-picking a heading
      }
    }

    // horizontal: axis by axis, bounce the heading if we'd clip something
    const ca = Math.cos(m.dirAngle), sa = Math.sin(m.dirAngle);
    if (m.speed > 0) {
      const nx = m.pos.x + ca * m.speed * dt;
      if (!mobBlocked(m, nx, m.pos.z)) m.pos.x = nx; else m.dirAngle += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random());   // steer around the obstacle instead of re-rolling a random heading
      const nz = m.pos.z + sa * m.speed * dt;
      if (!mobBlocked(m, m.pos.x, nz)) m.pos.z = nz; else m.dirAngle += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random());   // steer around the obstacle instead of re-rolling a random heading
    }

    // vertical: ease onto the terrain; use gravity only for genuine falls into gaps
    const fx = Math.floor(m.pos.x), fz = Math.floor(m.pos.z);
    const surfY = inBounds(fx, 0, fz) ? topSolidY(fx, fz) + 1 : m.pos.y;
    if (m.airborne) {   // hit-hop: gravity until it settles back onto the terrain
        m.vy -= GRAVITY * dt; if (m.vy < -28) m.vy = -28;
        let ny = m.pos.y + m.vy * dt;
        if (ny <= surfY) { ny = surfY; m.vy = 0; m.airborne = false; }
        m.pos.y = ny;
      } else if (surfY - m.pos.y > 1.05) {
      m.vy = 0;                                             // can't rise more than one block: no floating up walls / tree trunks
    } else {
      m.pos.y += (surfY - m.pos.y) * Math.min(1, dt * 12);   // step up (max 1 block) / sink down smoothly
      m.vy = 0;
    }

    // face the way we're moving, with a little turn-inertia
    const targetYaw = Math.atan2(ca, sa);
    let dyaw = ((targetYaw - m.faceYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    m.faceYaw += dyaw * Math.min(1, dt * 6);

    // hit flash: tint red briefly, then ease back to the base colours
    if (m.hitT > 0) { m.hitT -= dt; const on = m.hitT > 0; for (const p of m.parts) p.m.material.color.setHex(on ? 0xff5346 : p.base); }
    else for (const p of m.parts) if (p.m.material.color.getHex() !== p.base) p.m.material.color.setHex(p.base);

    m.group.position.copy(m.pos);
    m.group.rotation.y = m.faceYaw;
  }
}

// which mob is the crosshair over? (nearest along the view ray within reach)
const MOB_REACH = 5;
function targetedMob() {
  camera.getWorldDirection(_mv);   // normalised world-space view direction (-z)
  let best = null, bestT = Infinity;
  for (const m of MOBS) {
    if (!m.alive) continue;
    const cx = m.pos.x - camera.position.x, cy = m.pos.y + m.height * 0.5 - camera.position.y, cz = m.pos.z - camera.position.z;
    const dist = Math.hypot(cx, cy, cz);
    if (dist > MOB_REACH || dist < 0.01) continue;
    const dot = (cx * _mv.x + cy * _mv.y + cz * _mv.z) / dist;          // cosine of the aim angle
    if (dist * Math.sqrt(Math.max(0, 1 - dot * dot)) > m.radius) continue;   // crosshair off-target -> miss
    const tproj = cx * _mv.x + cy * _mv.y + cz * _mv.z;                 // distance along the ray
    if (tproj < bestT) { bestT = tproj; best = m; }
  }
  return best;
}

function attackMob() {   // one swing at whatever's being aimed at. true on a hit
  const m = targetedMob();
  if (!m) return false;
  m.hp -= 5; m.hitT = 0.18;
  SFX.mobHurt(m.type);                       // each species yelps differently
  {                                          // little hop - only when standing on the ground
    const gY = inBounds(Math.floor(m.pos.x), 0, Math.floor(m.pos.z)) ? topSolidY(Math.floor(m.pos.x), Math.floor(m.pos.z)) + 1 : m.pos.y;
    if (!m.airborne && m.pos.y <= gY + 0.25) { m.vy = MOB_TYPES[m.type].jump; m.airborne = true; }
  }
  triggerArmSwing('break');
  if (m.hp <= 0) killMob(m);
  return true;
}

spawnMobs(60);    // tripled (was 20) — spread across most of the map, kept well apart (see spawnMobs for the anti-crowd rule)

// ============================================================ dialogue caption
// A single friendly line from a helper NPC (e.g. asking for help). Deliberately minimal —
// this is the "an NPC needs help" channel, not a dialogue system.
const dialogEl = document.getElementById('dialogue');
let dialogT = 0;
function sayDialog(name, text, ms = 4500) {
  dialogEl.textContent = name + ': ' + text;
  dialogEl.classList.add('show');
  dialogT = ms;
}
function updateDialog(dt) {
  if (dialogT <= 0) return;
  dialogT -= dt;
  if (dialogT <= 0) dialogEl.classList.remove('show');
}

// ============================================================ settler NPCs (helpers, not prey)
// Friendly characters who live in the world and *need help*. Helping one is how the player
// earns tools — a math capability becomes an object you acquire by assisting a stranger,
// never a feature handed to you. Each settler asks a small, concrete favour.
const NPCS = [];
function makeSettlerMesh() {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z); g.add(m); return m;
   };
   // a small human-sized figure in warm "settler" colours, with a hip satchel
  box(0.30, 0.40, 0.18, 0,      0.52, 0,    0x7a5a3a);   // torso / tunic
  box(0.24, 0.24, 0.24, 0,      0.86, 0,    0xe0b48a);   // head
  box(0.10, 0.30, 0.10, -0.22, 0.55, 0,   0x5f4630);   // left arm
  box(0.10, 0.30, 0.10,  0.22, 0.55, 0,   0x5f4630);   // right arm
  box(0.12, 0.42, 0.12, -0.09, 0.18, 0,   0x33333d);   // left leg
  box(0.12, 0.42, 0.12,  0.09, 0.18, 0,   0x33333d);   // right leg
  box(0.34, 0.14, 0.10,  0.04, 0.55, 0.14, 0x8a6a3a);  // satchel at the hip
  g.scale.setScalar(0.92);
  return g;
}
function addSettler(x, y, z, name, task) {
  const g = makeSettlerMesh();
  g.position.set(x, y, z);
  scene.add(g);
  NPCS.push({ name, task, pos: new THREE.Vector3(x, y, z), group: g, helped: false, spoke: false, faceYaw: Math.random() * 6.28, bobT: Math.random() * 3 });
}
function spawnSettlers() {
    // one settler a short walk from spawn so the player meets the "help a stranger" pattern early
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    const tx = Math.floor(spawnXZ[0] + Math.cos(a) * 15), tz = Math.floor(spawnXZ[1] + Math.sin(a) * 15);
    if (!inBounds(tx, 3, tz)) continue;
    const hgt = topSolidY(tx, tz);
    if (hgt < WL + 1) continue;
    const surf = blockAt(tx, hgt, tz);
    if (surf !== GRASS && surf !== DIRT && surf !== SAND) continue;
    addSettler(tx + 0.5, hgt + 1 + 0.02, tz + 0.5, 'Pip', 'measure');
    return;     // one settler for now; more as more tools exist
   }
}
function targetedNPC() {
  camera.getWorldDirection(_mv);
  let best = null, bestT = Infinity;
  for (const n of NPCS) {
    const cx = n.pos.x - camera.position.x, cy = n.pos.y + 0.8 - camera.position.y, cz = n.pos.z - camera.position.z;
    const dist = Math.hypot(cx, cy, cz);
    if (dist > 5 || dist < 0.01) continue;
    const dot = (cx * _mv.x + cy * _mv.y + cz * _mv.z) / dist;
    if (dist * Math.sqrt(Math.max(0, 1 - dot * dot)) > 0.7) continue;
    const tproj = cx * _mv.x + cy * _mv.y + cz * _mv.z;
    if (tproj < bestT) { bestT = tproj; best = n; }
   }
  return best;
}
function interactNPC() {
  const n = targetedNPC();
  if (!n) return false;
  if (!n.helped) {
    if (!hasItem(RANGE_ROD)) addItem(RANGE_ROD, 1);       // the favour, granted: the tool is yours
    sayDialog(n.name, 'Thank you — that ridge is far. Take my range rod; it suits steady hands.');
    n.helped = true;
    triggerArmSwing('place');
   }
  return true;     // consume the click so it doesn't swing a weapon through the NPC
}
function updateNPCs(dt) {
  for (const n of NPCS) {
    n.bobT += dt;
    const bob = Math.sin(n.bobT * 1.4) * 0.03;
    n.group.position.set(n.pos.x, n.pos.y + bob, n.pos.z);
    const dx = player.pos.x - n.pos.x, dz = player.pos.z - n.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 16) {
      const target = Math.atan2(dx, dz);
      let dyaw = ((target - n.faceYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      n.faceYaw += dyaw * Math.min(1, dt * 4);
      n.group.rotation.y = n.faceYaw;
     }
      // ask for the favour once, when the player first comes close
    if (!n.helped && !n.spoke && dist < 7) { sayDialog(n.name, 'I have shaky hands — can you measure that ridge for me?'); n.spoke = true; }
   }
}
spawnSettlers();

const mouseState = { left: false, right: false, lastAct: 0, lastAttack: 0 };

document.addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) selectSlot(+m[1] - 1);
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function clearInput() {
  for (const k of Object.keys(keys)) delete keys[k];
  mouseState.left = false; mouseState.right = false;
}

document.getElementById('overlay').addEventListener('click', () => {
  SFX.unlock();
  if (!locked) renderer.domElement.requestPointerLock();
});
window.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  document.body.classList.toggle('locked', locked);
  if (!locked) clearInput();
});

document.addEventListener('mousemove', e => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  const lim = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
});

document.addEventListener('contextmenu', e => { if (locked) e.preventDefault(); });

function tryAct(button, now) {
  const hit = aimHit();
  const ok = button === 0 ? doBreak(hit) : doPlace(hit);
  if (ok) mouseState.lastAct = now;
}

document.addEventListener('mousedown', e => {
  if (!locked) return;
  if (e.button === 0) { mouseState.left = true; const now = performance.now(); if (attackMob()) mouseState.lastAttack = now; else { mining = null; miningT = 0; } }  // hold to mine
  if (e.button === 2) { mouseState.right = true; tryAct(2, performance.now()); }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseState.left = false;
  if (e.button === 2) mouseState.right = false;
});

window.addEventListener('wheel', e => {
  selectSlot(selIndex + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

// ============================================================ per-frame physics
function stepPhysics(dt) {
  if (!locked) return; // frozen until the mouse is captured

  const forward = keys['KeyW'], back = keys['KeyS'];
  const strafeL = keys['KeyA'], strafeR = keys['KeyD'];
  // ---- swimming state: is any part of our body in a water block? (simplified Minecraft)
  const swX = Math.floor(player.pos.x), swZ = Math.floor(player.pos.z);
  const bodyInWater = blockAt(swX, Math.floor(player.pos.y - EYE + 0.5), swZ) === WATER;   // torso/feet
  const headInWater = blockAt(swX, Math.floor(player.pos.y - 0.3), swZ) === WATER;        // head
  const inSwim = bodyInWater || headInWater;

  const sprinting = (keys['ShiftLeft'] || keys['ShiftRight']) && forward && !inSwim;   // no sprint underwater

  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let dx = 0, dz = 0;
  if (forward) { dx += -sy; dz += -cy; }   // camera forward on the ground plane
  if (back)    { dx +=  sy; dz +=  cy; }
  if (strafeR) { dx +=  cy; dz += -sy; }   // right = forward Ã— up... verified: (cos y, 0, -sin y)
  if (strafeL) { dx += -cy; dz +=  sy; }
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }

  const speed = inSwim ? WALK_SPEED * SWIM_SPEED_MULT : WALK_SPEED * (sprinting ? SPRINT_MULT : 1);   // much slower swimming underwater

  // horizontal: one axis at a time with snap-back collision
  const px = player.pos.x, pz = player.pos.z;
  moveAxis('x', player.pos.x + dx * speed * dt);
  moveAxis('z', player.pos.z + dz * speed * dt);
  player._moveAmt = Math.hypot(player.pos.x - px, player.pos.z - pz); // for the arm's walk bob
    hungerMode = sprinting ? 'run' : (player._moveAmt > 0.01) ? 'walk' : 'idle';   // drives the hunger drain rate

  // vertical
  if (inSwim) {
    // underwater: weak gravity, and sinking never gets faster than a gentle glide - falling in is safe
    player.vy -= GRAVITY * WATER_GRAV_MULT * dt;
    const diving = keys['ShiftLeft'] || keys['ShiftRight'];
    if (keys['Space']) {            // hold Space to swim up toward the surface
      player.vy += (SWIM_RISE_SPEED - player.vy) * Math.min(1, dt * 6);
    } else if (diving) {            // hold Shift to dive down to the bottom
      player.vy -= GRAVITY * 0.5 * dt;
      if (player.vy < WATER_FALL_CAP - 2) player.vy = WATER_FALL_CAP - 2;
    } else if (headInWater) {       // fully submerged with no input: buoyancy floats you back up
      player.vy = Math.min(player.vy + 2.5 * dt, 1.8);
    }
    if (player.vy < WATER_FALL_CAP) player.vy = WATER_FALL_CAP;
  } else {
    player.vy -= GRAVITY * dt;
    if (player.vy < -48) player.vy = -48;
  }
  if (keys['Space'] && player.onGround) { player.vy = JUMP_V; SFX.jump(); }   // a full jump also works in shallow water: hop out over ledges/banks

  const hitY = moveAxis('y', player.pos.y + player.vy * dt);
  player.onGround = false;
  if (hitY && player.vy <= 0) {
    const impact = -player.vy;                 // fall speed at the moment of landing
    player.onGround = true; player.vy = 0;
    if (impact > 7) SFX.land((impact - 7) / 28);   // hard landings thud + dust kick-up
    const fallen = impact * impact / (2 * GRAVITY);   // approx block count of the fall
    if (fallen > 4 && health > 0) takeDamage(Math.max(1, Math.round(fallen - 3)));  // safe up to a ~3-block drop, like vanilla
  }
  else if (hitY) player.vy = 0; // bonked head

  // footsteps: cadence follows distance travelled, so sprinting steps faster for free
  if (player.onGround && !inSwim) {   // no footstep sounds while wading/swimming
    stepAccum += Math.hypot(player.pos.x - px, player.pos.z - pz);
    if (stepAccum >= STEP_DIST) { stepAccum = 0; SFX.footstep(surfaceUnderFoot()); }
  } else stepAccum = 0;

  // safety: keep inside the map horizontally, respawn if we ever fall out of the world
  const p = player.pos;
  p.x = Math.max(PHALF + 0.01, Math.min(W - PHALF - 0.01, p.x));
  p.z = Math.max(PHALF + 0.01, Math.min(D - PHALF - 0.01, p.z));
  if (p.y < -20) { // fell out somehow — respawn somewhere safe
    takeDamage(999);          // the void is lethal - die() respawns at spawn with full hearts
    respawnPlayer();
  }

  syncCamera();
}

// hold-to-repeat mining/placing while the button is kept down
function heldActions() {
  if (!locked) return;
  const now = performance.now();
  if (mouseState.left && now - mouseState.lastAttack > 300) {
    if (interactNPC()) mouseState.lastAttack = now;               // talking to a helper NPC, not attacking
    else if (attackMob()) mouseState.lastAttack = now;            // hold to keep swinging at a mob
   }
  if (mouseState.right && now - mouseState.lastAct > 240) tryAct(2, now);
}

// ============================================================ debug HUD (top-left)
const debugEl = document.getElementById('debug');
let fpsSmooth = 60, frameMs = 16.7, hudTimer = 0;
const COMPASS = ['N','NE','E','SE','S','SW','W','NW'];
function updateDebug(dt) {
  const inst = dt > 0 ? 1 / dt : 60;
  fpsSmooth += (Math.min(inst, 240) - fpsSmooth) * 0.1;      // light smoothing
  frameMs += (dt * 1000 - frameMs) * 0.1;
  hudTimer += dt;
  if (hudTimer < 0.1) return;                                  // refresh ~10x/s
  hudTimer = 0;
  const p = player.pos;
  const bearing = ((Math.atan2(-Math.sin(player.yaw), Math.cos(player.yaw)) * 180 / Math.PI + 360) % 360);
  const dir = COMPASS[Math.round(bearing / 45) % 8];
  const pitchDeg = player.pitch * 180 / Math.PI;
  debugEl.textContent =
    `fps: ${fpsSmooth.toFixed(0)}
` +
    `frame: ${frameMs.toFixed(2)} ms
` +
    `pos: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}
` +
    `dir: ${dir} ${bearing.toFixed(0)}Â°  pitch ${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(0)}Â°`;
}

// ============================================================ range rod (legibility, via a tool)
// The first "math is in the world" surface — but it's a *tool you earn*, not a HUD you're
// handed. Holding the Range Rod (selected in the hotbar) reads the distance and vertical
// scale of the world, magnitude-rounded: a long way across the map reads in tens, not to
// the block, because precision at that scale is an illusion and the point is number sense,
// not an exact answer. The reading is drawn on the rod's screen and echoed in a small panel.
const measureEl = document.getElementById('measure');

// magnitude-aware rounding: small distances read exactly, large ones coarser
function rough(n) {
  const a = Math.abs(n);
  if (a < 10)  return Math.round(n);
  if (a < 100) return Math.round(n / 5) * 5;
  if (a < 500) return Math.round(n / 10) * 10;
  return Math.round(n / 25) * 25;
}
// a plain magnitude word, so the reading is a *feel*, not just a figure
function rangeBand(n) {
  const a = Math.abs(n);
  if (a < 6)   return 'next to you';
  if (a < 20)  return 'a short way off';
  if (a < 60)  return 'a long way';
  if (a < 200) return 'across the map';
  return 'far beyond sight';
}

// draw the rod's LCD: a couple of "LED bars" for the range magnitude (visual — the panel
// holds the legible figures). Called every frame the rod is held.
function paintToolScreen(range, rise) {
  if (!toolScreenCtx) return;
  const g = toolScreenCtx;
  g.fillStyle = '#04140c'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#39d97a';
  const mag = range == null ? 0 : Math.max(0.06, Math.min(1, rough(range) / 200));
  g.fillRect(3, 7, 26 * mag, 4);
  if (rise != null) {
    const rr = Math.max(0, Math.min(1, (rise + 20) / 40));
    g.fillRect(3, 23, 26 * rr, 4);
   }
  toolScreenTex.needsUpdate = true;
}
function updateMeasure(dt) {
  const rodHeld = !!inventory[selIndex] && inventory[selIndex].id === RANGE_ROD;
  if (!rodHeld || !locked) { measureEl.classList.toggle('show', false); return; }
  measureEl.classList.add('show');

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
    // look far out: the rod is about the world, not the 6-block mining reach
  const hit = raycastVoxel(camera.position, dir, 300);
  const feetLevel = topSolidY(Math.floor(camera.position.x), Math.floor(camera.position.z));

  let range = null, rise = null;
  if (hit) {
    const tx = hit.x + 0.5, ty = hit.y + 0.5, tz = hit.z + 0.5;      // block face you're looking at
    range = Math.hypot(tx - camera.position.x, ty - camera.position.y, tz - camera.position.z);
    rise    = topSolidY(hit.x, hit.z) - feetLevel;                   // vertical magnitude vs. where you stand
   }
  paintToolScreen(range, rise);
  const r = rise == null ? null : rough(rise);
  let out = 'RANGE ROD';
  out += '\nrange    ' + (range == null ? 'open space' : '~' + rough(range) + '    ' + rangeBand(range));
  out += '\nheight   ' + (r == null ? '—' : r === 0 ? 'level' : (r > 0 ? '+' : '−') + Math.abs(r) + (r > 0 ? ' up' : ' down'));
  measureEl.textContent = out;
}

// ---- cacti hurt like vanilla: one heart per touch, plus a shove/hop out of them
let lastCactusT = -1e9;
function cactusTick() {
  const p = player.pos;
  if (health <= 0) return;
  const bx0 = Math.floor(p.x - PHALF), bx1 = Math.floor(p.x + PHALF);
  const by0 = Math.floor(p.y - EYE),   by1 = Math.floor(p.y - EYE + PHEIGHT);
  const bz0 = Math.floor(p.z - PHALF), bz1 = Math.floor(p.z + PHALF);
  let cx, cy, cz;
  outer: for (let y = by0; y <= by1; y++)
    for (let z = bz0; z <= bz1; z++)
      for (let x = bx0; x <= bx1; x++)
        if (blockAt(x, y, z) === CACTUS) { cx = x; cy = y; cz = z; break outer; }
  if (cx === undefined) return;
  const now = performance.now();
  if (now - lastCactusT > 300) {         // short mercy window so standing in thorns isn't instant death
    lastCactusT = now;
    takeDamage(2);                       // one heart, like vanilla cacti
    SFX.cactusHurt();
  }
  // push out toward whichever side is freer and hop up a bit so you land clear of it
  const dirx = p.x - (cx + 0.5), dirz = p.z - (cz + 0.5);
  if (Math.abs(dirx) >= Math.abs(dirz)) {
    const to = p.x + Math.sign(dirx || 1) * 0.45;
    if (!collidesAt('x', to)) player.pos.x = to;
  } else {
    const to = p.z + Math.sign(dirz || -1) * 0.45;
    if (!collidesAt('z', to)) player.pos.z = to;
  }
  player.vy = Math.max(player.vy, 6.5);
}

// ============================================================ main loop
const clock = new THREE.Clock(); let _wasSubmerged = null;   // tracks whether the eye is in water (toggles blue fog / sky visibility)
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  stepPhysics(dt);
  cactusTick();
  heldActions();
  if (targetedMob() || targetedNPC()) mining = null;    // don't crack the block you're swinging at over a mob/NPC
  updateMobs(dt);
  updateNPCs(dt);
  updateMining(dt);
  updateArm(dt);
  updateDrops(dt);
  updateHurtFlash(dt); updateOxygen(dt); updateEat(dt); updateHunger(dt);
  updateDebug(dt);
  updateMeasure(dt);
  updateDialog(dt);

  for (const cl of cloudGroup.children) {         // drift the clouds and wrap them around
    cl.position.x += dt * 1.6;
    if (cl.position.x > W + 30) cl.position.x -= W + 60;   // wrap to the far side of the map, keeping coverage even
  }
  skyDome.position.copy(camera.position);        // keep the dome centered on the camera

  ensureNearChunks(camera.position.x, camera.position.z);   // stream in regions as we walk toward them (big map)
  cullRegions();      // don't draw what the fog hides anyway
    // underwater look: blue fog filter + hide the sky when the eye is in water (the DoubleSide surface still shows above)
    const _sub = blockAt(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === WATER;
    if (_sub !== _wasSubmerged) {
      _wasSubmerged = _sub;
      scene.fog.color.set(_sub ? 0x1a5ca8 : 0xcfe9fb);   // deep blue tint underwater
      scene.fog.near = _sub ? 2 : 48;                    // everything fades to blue quickly under water
      scene.fog.far   = _sub ? 60 : 120;
      skyDome.visible = !_sub;                           // no pale sky while submerged
      sun.visible     = !_sub;
      cloudGroup.visible = !_sub; renderer.setClearColor(_sub ? 0x1a5ca8 : 0xcfe9fb);   // matches fog while sky dome is hidden
    }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

selectSlot(0);
syncCamera();
