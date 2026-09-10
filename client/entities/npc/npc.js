import * as THREE from 'three';
import { GRASS, DIRT, SAND, WL, RANGE_ROD, inBounds, blockAt, topSolidY } from '../../core/voxel-grid.js';
import { scene, camera } from '../../core/scene.js';
import { player } from '../../player/player.js';
import { triggerArmSwing } from '../../player/arm.js';
import { hasItem, addItem } from '../../inventory/inventory.js';
import { sayDialog } from './dialogue.js';

// ============================================================ settler NPCs (helpers, not prey)
// Friendly characters who live in the world and *need help*. Helping one is how the player
// earns tools — a math capability becomes an object you acquire by assisting a stranger,
// never a feature handed to you. Each settler asks a small, concrete favour.
//
// NOTE (module-split amendment): this slice keeps spawnSettlers()/interactNPC() as direct
// code, matching the original exactly — it does NOT yet adopt the data-driven quest-data.js
// content model from DEV_HANDOFF.md §5. That generalization (settler definitions as data,
// a trigger evaluator, per-context nodeIds) is Slice 3 work per DEV_HANDOFF.md §8's task
// table ("Social channel: first NPC who *reasons while doing*" — blocked on character copy),
// not part of this behavior-identical module refactor.
export const NPCS = [];
const _mv = new THREE.Vector3();   // reused view-direction vector (see entities/mobs.js for the same pattern)

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
// spawnXZ is passed in rather than imported, same as entities/mobs.js's spawnMobs — see
// IMPLEMENTATION_PLAN.md's Slice A log.
export function spawnSettlers(spawnXZ) {
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
export function targetedNPC() {
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
export function interactNPC() {
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
export function updateNPCs(dt) {
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
