import * as THREE from 'three';
import { GRASS, DIRT, SAND, WOOD, WL, inBounds, blockAt, setBlockRaw, topSolidY } from '../../core/voxel-grid.js';
import { rebuildAround } from '../../core/chunks.js';
import { scene, camera } from '../../core/scene.js';
import { player } from '../../player/player.js';
import { triggerArmSwing } from '../../player/arm.js';
import { hasItem, addItem } from '../../inventory/inventory.js';
import { sayDialog } from './dialogue.js';
import { SETTLERS } from './quest-data.js';

// ============================================================ settler NPCs (helpers, not prey)
// Friendly characters who live in the world and *need help*. Helping one is how the player
// earns tools — a math capability becomes an object you acquire by assisting a stranger,
// never a feature handed to you.
//
// This file is the generic engine per DEV_HANDOFF.md §5: it walks each settler's ordered
// `contexts` (quest-data.js) and knows nothing about Pip or Wren specifically. Adding a
// third settler, or a third beat for an existing one, should only ever touch quest-data.js.
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

// Search a ring around a candidate spot for a real nearby high point — a hill or ridge
// the terrain generator's "small mountains" pass (core/voxel-grid.js's heightAt) actually
// built — so a settler's "that ridge" refers to something the player can see and walk to,
// not an arbitrary unlabeled direction. Returns null if nothing meaningfully higher is
// nearby within the search radius (flat spawn area); callers fall back to generic phrasing.
const RIDGE_SEARCH_RADIUS = 48, RIDGE_SEARCH_STEP = 4, RIDGE_MIN_RISE = 6;
function findNearbyRidge(cx, cz, baseH) {
  let best = null, bestH = baseH + RIDGE_MIN_RISE - 1;
  for (let dz = -RIDGE_SEARCH_RADIUS; dz <= RIDGE_SEARCH_RADIUS; dz += RIDGE_SEARCH_STEP) {
    for (let dx = -RIDGE_SEARCH_RADIUS; dx <= RIDGE_SEARCH_RADIUS; dx += RIDGE_SEARCH_STEP) {
      const x = cx + dx, z = cz + dz;
      if (!inBounds(x, 3, z)) continue;
      const h = topSolidY(x, z);
      if (h > bestH) { bestH = h; best = { x, z, h }; }
    }
  }
  return best;
}

// Plant a bare, leafless post on the landmark itself — the terrain generator never builds
// a bald wood column (its trees always carry a leaf crown), so this reads at a glance as
// "someone put that there," not as another tree. This is the actual answer to "which rise
// do you mean": a real object in the world the player can walk to and sight along, not a
// waypoint arrow or a minimap marker, which would look like a HUD.
const MARKER_HEIGHT = 5;
function plantMarker(x, z, h) {
  for (let i = 1; i <= MARKER_HEIGHT; i++) setBlockRaw(x, h + i, z, WOOD);
  rebuildAround(x, z);
}

function addSettler(x, y, z, spec, landmark) {
  const g = makeSettlerMesh();
  g.position.set(x, y, z);
  scene.add(g);
  // idle-facing points toward the landmark (if there is one) before the player ever gets
  // close enough to make the NPC turn to face them — a subtle "this is what I mean" cue
  // instead of a waypoint marker or arrow, which would read as a HUD, not a stranger.
  const faceYaw = landmark ? Math.atan2(landmark.x - x, landmark.z - z) : Math.random() * 6.28;
  const n = {
    spec, name: spec.displayName, pos: new THREE.Vector3(x, y, z), group: g, landmark,
    completedContexts: new Set(), spokenApproachFor: new Set(), nudgedFor: new Set(),
    faceYaw, bobT: Math.random() * 3,
  };
  NPCS.push(n);
  return n;
}

// spawnXZ is passed in rather than imported, same as entities/mobs.js's spawnMobs — see
// IMPLEMENTATION_PLAN.md's Slice A log.
export function spawnSettlers(spawnXZ) {
  for (const spec of SETTLERS) {
    const { radius, findLandmark, minSep } = spec.spawn;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      const tx = Math.floor(spawnXZ[0] + Math.cos(a) * radius), tz = Math.floor(spawnXZ[1] + Math.sin(a) * radius);
      if (!inBounds(tx, 3, tz)) continue;
      const hgt = topSolidY(tx, tz);
      if (hgt < WL + 1) continue;
      const surf = blockAt(tx, hgt, tz);
      if (surf !== GRASS && surf !== DIRT && surf !== SAND) continue;
      if (minSep > 0 && NPCS.some(o => Math.hypot(o.pos.x - tx, o.pos.z - tz) < minSep)) continue;
      const landmark = findLandmark ? findNearbyRidge(tx, tz, hgt) : null;
      if (landmark) plantMarker(landmark.x, landmark.z, landmark.h);
      addSettler(tx + 0.5, hgt + 1 + 0.02, tz + 0.5, spec, landmark);
      break;
     }
   }
}

// The first context this NPC hasn't completed yet, skipping any whose `contexts-done`
// prerequisite isn't satisfied (there is nothing left to say/do until it is).
function currentContext(n) {
  for (const ctx of n.spec.contexts) {
    if (n.completedContexts.has(ctx.id)) continue;
    if (ctx.trigger?.type === 'contexts-done' && !ctx.trigger.ids.every(id => n.completedContexts.has(id))) return null;
    return ctx;
  }
  return null;
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
  const ctx = currentContext(n);
  if (!ctx) return true;                     // nothing left to say or do — consume the click quietly
  const ready = ctx.ready ? ctx.ready(n) : true;
  if (!ready) {
    if (ctx.lines.nudge && !n.nudgedFor.has(ctx.id)) {
      sayDialog(n.name, ctx.lines.nudge(n));
      n.nudgedFor.add(ctx.id);
    }
    return true;
   }
  if (ctx.grantsItem && !hasItem(ctx.grantsItem)) addItem(ctx.grantsItem, 1);   // the favour, granted: the tool is yours
  sayDialog(n.name, ctx.lines.grant(n));
  n.completedContexts.add(ctx.id);
  triggerArmSwing('place');
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

    const ctx = currentContext(n);
    if (!ctx) continue;
    if (ctx.track) ctx.track(n, dt);   // background state (e.g. "has the rod sighted the marker"), independent of proximity
    if (ctx.lines.approach && !n.spokenApproachFor.has(ctx.id) && dist < (ctx.trigger?.dist ?? 7)) {
      sayDialog(n.name, ctx.lines.approach(n));
      n.spokenApproachFor.add(ctx.id);
    }
   }
}
