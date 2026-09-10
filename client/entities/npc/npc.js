import * as THREE from 'three';
import { GRASS, DIRT, SAND, WOOD, WL, RANGE_ROD, TALLY_SLATE, inBounds, blockAt, setBlockRaw, topSolidY } from '../../core/voxel-grid.js';
import { rebuildAround } from '../../core/chunks.js';
import { scene, camera } from '../../core/scene.js';
import { player } from '../../player/player.js';
import { triggerArmSwing } from '../../player/arm.js';
import { hasItem, addItem } from '../../inventory/inventory.js';
import { sayDialog } from './dialogue.js';
import { rough, rangeBand, measureState } from '../../inventory/tools/range-rod.js';

// ============================================================ settler NPCs (helpers, not prey)
// Friendly characters who live in the world and *need help*. Helping one is how the player
// earns tools — a math capability becomes an object you acquire by assisting a stranger,
// never a feature handed to you. Each settler asks a small, concrete favour.
//
// NOTE (module-split amendment): this slice keeps spawnSettlers()/interactNPC() as direct
// code, matching the original exactly — it does NOT yet adopt the data-driven quest-data.js
// content model from DEV_HANDOFF.md §5. That generalization (settler definitions as data,
// a trigger evaluator, per-context nodeIds) is Slice 3 work per DEV_HANDOFF.md §8's task
// table ("Social channel: first NPC who *reasons while doing*" — blocked on character copy).
// SETTLER_SPECS below is a light, hand-rolled step in that direction (enough to support
// two settlers without duplicating spawnSettlers/interactNPC per character) — still direct
// code, not the generalized trigger engine §5 describes.
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
// built — so Pip's "that ridge" refers to something the player can see and walk to, not
// an arbitrary unlabeled direction. Returns null if nothing meaningfully higher is nearby
// within the search radius (flat spawn area); callers fall back to generic phrasing.
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

// One entry per settler. `ask`/`grant` take the NPC instance so they can read `n.landmark`
// (only Pip uses it). `radius`/`minSep` place each settler a plausible distance from spawn
// without overlapping another settler that's already been placed this call.
const SETTLER_SPECS = [
  {
    name: 'Pip', grantItem: RANGE_ROD, radius: 15, findLandmark: true, minSep: 0,
    ask: (n) => n.landmark
      ? "I have shaky hands — see the post I staked on that rise? I'm hoping it's close enough to carry a signal fire, but I can't judge the distance myself anymore."
      : "I have shaky hands — I need to know how far off things are before I trust a route, and my eyes aren't what they used to be.",
    grant: (n) => n.landmark
      ? "Take the rod — line it up on the post I staked and see what you get. If it's close enough, that's our next relay point."
      : "Take the rod and get a feel for the distances out here — I won't commit to a walk until I know what I'm in for.",
  },
  {
    // Hearth Camp's quartermaster — close to spawn, per STORYLINE.md §3. References Pip by
    // name for continuity even though the two never actually talk; the player meets Pip
    // first (Pip spawns closer to the front of the search ring), so this reads as "word
    // travels fast in a small camp," not a broken reference.
    name: 'Wren', grantItem: TALLY_SLATE, radius: 8, findLandmark: false, minSep: 10,
    ask: () => "Pip mentioned you were handy — could you help me keep an eye on the stores? My own count keeps slipping.",
    grant: () => "Here — take this tally slate. Carry it and it'll keep a running count of what's on you, and how your food's holding out. Saves me asking every time you pass through.",
  },
];

function addSettler(x, y, z, spec, landmark) {
  const g = makeSettlerMesh();
  g.position.set(x, y, z);
  scene.add(g);
  // idle-facing points toward the landmark (if there is one) before the player ever gets
  // close enough to make the NPC turn to face them — a subtle "this is what I mean" cue
  // instead of a waypoint marker or arrow, which would read as a HUD, not a stranger.
  const faceYaw = landmark ? Math.atan2(landmark.x - x, landmark.z - z) : Math.random() * 6.28;
  const n = {
    name: spec.name, grantItem: spec.grantItem, ask: spec.ask, grant: spec.grant,
    pos: new THREE.Vector3(x, y, z), group: g, landmark,
    helped: false, spoke: false, reported: false, nudged: false,
    faceYaw, bobT: Math.random() * 3,
  };
  NPCS.push(n);
  return n;
}
// spawnXZ is passed in rather than imported, same as entities/mobs.js's spawnMobs — see
// IMPLEMENTATION_PLAN.md's Slice A log.
export function spawnSettlers(spawnXZ) {
  for (const spec of SETTLER_SPECS) {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      const tx = Math.floor(spawnXZ[0] + Math.cos(a) * spec.radius), tz = Math.floor(spawnXZ[1] + Math.sin(a) * spec.radius);
      if (!inBounds(tx, 3, tz)) continue;
      const hgt = topSolidY(tx, tz);
      if (hgt < WL + 1) continue;
      const surf = blockAt(tx, hgt, tz);
      if (surf !== GRASS && surf !== DIRT && surf !== SAND) continue;
      if (spec.minSep > 0 && NPCS.some(o => Math.hypot(o.pos.x - tx, o.pos.z - tz) < spec.minSep)) continue;
      const landmark = spec.findLandmark ? findNearbyRidge(tx, tz, hgt) : null;
      if (landmark) plantMarker(landmark.x, landmark.z, landmark.h);
      addSettler(tx + 0.5, hgt + 1 + 0.02, tz + 0.5, spec, landmark);
      break;
     }
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
    if (!hasItem(n.grantItem)) addItem(n.grantItem, 1);   // the favour, granted: the tool is yours
    // Granting the tool is not "thanks, you're done" for Pip specifically — nothing has
    // been measured yet. The ask and the report-back are two separate beats, closed below
    // once the rod has actually been pointed at something (see range-rod.js's measureState).
    // Wren's favour has no report-back: the tally slate is an ongoing readout, not a single
    // measurement to bring back, so granting it *is* the whole favour.
    sayDialog(n.name, n.grant(n));
    n.helped = true;
    triggerArmSwing('place');
    return true;
   }
  if (n.grantItem === RANGE_ROD && !n.reported) {
    if (measureState.everMeasured) {
      // Whatever the player actually measured — echoed back, not graded. Per MATH_PLAN.md
      // §8: no single correct numeric answer, no "wrong" reading. Pip's reaction only
      // colors the *tone* by magnitude (closer reads as good news for a relay point); it
      // never tells the player their reading was right or wrong.
      const band = rangeBand(measureState.lastRange);
      const r = rough(measureState.lastRange);
      const close = band === 'next to you' || band === 'a short way off' || band === 'a long way';
      sayDialog(n.name, close
        ? `So it's about ${r}, ${band} — well within reach. That'll make a fine relay point. Thank you.`
        : `About ${r}, ${band} — further than I'd hoped, but better to know now than halfway there. Thank you.`);
      n.reported = true;
    } else if (!n.nudged) {
      sayDialog(n.name, "Still no word? Aim the rod at something out there — its screen will show you.");
      n.nudged = true;
    }
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
    if (!n.helped && !n.spoke && dist < 7) { sayDialog(n.name, n.ask(n)); n.spoke = true; }
   }
}
