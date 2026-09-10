import * as THREE from 'three';
import { W, D, AIR, TALL_GRASS, WATER, blockAt, topSolidY } from '../core/voxel-grid.js';
import { camera, renderer } from '../core/scene.js';

// player size/reach
export const EYE = 1.62, PHEIGHT = 1.8, PHALF = 0.3, REACH = 6;

// Find a spawn spot: prefer the map center, spiraling outward until we find
// grass with six clear blocks of headroom (so trees can't spawn inside you).
export function findSpawn() {
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

// ============================================================ the player object
// Created once terrain generation has finished (findSpawn/topSolidY need real
// terrain) — see main.js's boot sequence. `player` is a live export: it starts
// undefined and is assigned by createPlayer(); every module that imports it
// gets the same object reference after that point (never reassigned again).
export let player;
export function createPlayer(spawnXZ) {
  player = {
    pos: new THREE.Vector3(spawnXZ[0] + 0.5, topSolidY(spawnXZ[0], spawnXZ[1]) + 1 + EYE + 0.02, spawnXZ[1] + 0.5), // eye position
    yaw: Math.PI * 0.78, pitch: -0.12,
    vy: 0, onGround: false,
  };
  return player;
}

export function syncCamera() {
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

// ============================================================ input state
// Raw control state lives here; the DOM listeners that turn it into game
// *actions* (mining, placing, attacking, inventory selection) are wired in
// main.js, which is the only module allowed to reach across every layer.
export const keys = Object.create(null);
export let locked = false;   // kept in sync every frame by syncLockState(), below
export const mouseState = { left: false, right: false, lastAct: 0, lastAttack: 0 };

export function clearInput() {
  for (const k of Object.keys(keys)) delete keys[k];
  mouseState.left = false; mouseState.right = false;
}

// NOTE (bugfix, see IMPLEMENTATION_PLAN.md's Slice A "Follow-up 2"): this used to update
// `locked` only from a `pointerlockchange` event listener. That event's target is spec'd
// as `Document`, but which EventTarget actually receives it (and whether it reaches
// `window`) turned out to vary — verified empirically to silently never fire on `window`
// in at least one real environment, which left `locked` stuck and broke input entirely.
// Rather than chase which target is reliable in which browser, syncLockState() below polls
// the one authoritative source, `document.pointerLockElement`, directly every frame from
// main.js's animate loop — at most one frame (well under 20ms) of staleness, and no
// dependency on any event actually firing at all.
export function syncLockState() {
  const was = locked;
  locked = document.pointerLockElement === renderer.domElement;
  if (locked !== was) {
    document.body.classList.toggle('locked', locked);
    if (!locked) clearInput();
  }
}

export function initPlayerControls() {
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') e.preventDefault();
    keys[e.code] = true;
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener('mousemove', e => {
    if (!locked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    const lim = Math.PI / 2 - 0.01;
    player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
  });

  document.addEventListener('contextmenu', e => { if (locked) e.preventDefault(); });
}
