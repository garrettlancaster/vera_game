import * as THREE from 'three';
import { H, solidForPhysics } from '../core/voxel-grid.js';
import { materials } from '../core/textures.js';
import { materialKey } from '../core/chunks.js';
import { scene } from '../core/scene.js';
import { player, EYE } from '../player/player.js';
import { GRAVITY } from '../physics/physics.js';
import { ITEM_INFO, addItem } from '../inventory/inventory.js';

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
export function spawnDrop(x, y, z, id) {
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
export function updateDrops(dt) {
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
