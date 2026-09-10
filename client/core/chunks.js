import * as THREE from 'three';
import { W, D, H, CH, AIR, GRASS, DIRT, STONE, WOOD, LEAVES, SAND, WATER, MEAT, CACTUS, TALL_GRASS, blocks, idx, inBounds } from './voxel-grid.js';
import { materials } from './textures.js';
import { scene, camera } from './scene.js';

// ============================================================ face / material setup
// corners are unit-cube coords (0/1); each quad winds so its normal points outward.
export const FACES = [
  { n: [1, 0, 0], c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uv: [[0,1],[0,0],[1,0],[1,1]], b: 0.62 }, // +x
  { n: [-1,0,0], c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], uv: [[1,1],[1,0],[0,0],[0,1]], b: 0.62 }, // -x
  { n: [0, 1, 0], c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [[0,1],[1,1],[1,0],[0,0]], b: 1.0  }, // +y
  { n: [0,-1, 0], c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [[0,0],[1,0],[1,1],[0,1]], b: 0.5  }, // -y
  { n: [0, 0, 1], c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], uv: [[0,1],[1,1],[1,0],[0,0]], b: 0.82 }, // +z
  { n: [0, 0,-1], c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], uv: [[1,1],[0,1],[0,0],[1,0]], b: 0.82 }, // -z
];

export function materialKey(id, fi) {
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

// ============================================================ chunk meshing
export const chunkMeshes = new Map(); // "cx,cz" -> THREE.Group
export const chunkWater = new Map(); // "cx,cz" -> per-chunk water geometry arrays (or null)

// All chunks' water is merged into ONE mesh: one transparent draw call per frame
// instead of three.js depth-sorting hundreds of per-chunk water buckets.
export const waterMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.water);
waterMesh.renderOrder = 1;   // blend after the opaque terrain
waterMesh.visible = false;
scene.add(waterMesh);

export function rebuildWater() {
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

export function neighborIdForFaces(x, y, z) {
  if (y < 0) return STONE;            // don't render the underside of the world
  if (!inBounds(x, y, z)) return AIR; // show side walls at map edges
  return blocks[idx(x, y, z)];
}

export function buildChunk(cx, cz) {
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

export function rebuildAllChunks() {
  for (let cz = 0; cz < D / CH; cz++) for (let cx = 0; cx < W / CH; cx++) buildChunk(cx, cz);
  rebuildWater();
}

// Rebuild the chunk containing (x,z) plus edge neighbors when needed.
export function rebuildAround(x, z) {
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
export const CULL_DIST = scene.fog.far + CH * 1.6;   // covers a region's half-diagonal with slack
export const CULL_D2 = CULL_DIST * CULL_DIST;
// Big map: a region is built the first time it gets close enough to render (the fog hides everything else),
// so walking across the world streams regions in instead of waiting for one giant initial build.
export function ensureNearChunks(ax, az) {
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

export function cullRegions() {
 const px = camera.position.x, pz = camera.position.z;
 for (const g of chunkMeshes.values()) {
  const dx = g.userData.cx * CH + CH / 2 - px, dz = g.userData.cz * CH + CH / 2 - pz;
  g.visible = dx * dx + dz * dz < CULL_D2;
 }
}
