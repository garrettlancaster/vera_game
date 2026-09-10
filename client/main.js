import * as THREE from 'three';
import SFX from './sounds.js';

// ---- CRITICAL IMPORT ORDER — do not reorder these three lines.
// The original single-file game.js built world-gen's ISLANDS array, textures.js's
// texCanvases, and scene.js's clouds — in that order — by drawing from the *same*
// seeded rnd() sequence (core/rng.js) at module-evaluation time. ES modules evaluate
// every import before any of the importing module's own top-level code runs, so the
// relative order of those three side effects is fixed by whichever import statement
// reaches each module FIRST across the whole program. Locking that order in right here,
// before anything else is imported, keeps the generated world and textures identical
// to the pre-refactor game. See IMPLEMENTATION_PLAN.md's Slice A log for the full
// reasoning. Once a module has evaluated once, every later import of it (from any
// other file) just reuses the same instance — this only has to happen once, here.
import { generateWorld } from './core/world-gen.js';
import './core/textures.js';
import './core/scene.js';

// ---- everything else (order below doesn't affect world-gen determinism)
import { W, WATER, blockAt } from './core/voxel-grid.js';
import { scene, camera, renderer, skyDome, sun, cloudGroup } from './core/scene.js';
import { ensureNearChunks, cullRegions } from './core/chunks.js';

import {
  findSpawn, createPlayer, syncCamera, keys, locked, mouseState, initPlayerControls,
} from './player/player.js';
import { updateArm, triggerArmSwing } from './player/arm.js';
import {
  updateHurtFlash, updateOxygen, updateEat, updateHunger,
} from './player/stats.js';
import { stepPhysics, cactusTick } from './physics/physics.js';

import { inventory, selIndex, selectSlot } from './inventory/inventory.js';
import { getToolFor } from './inventory/tools/tool-device.js';
import './inventory/tools/range-rod.js';   // side-effect import: registers the Range Rod tool

import { aimHit } from './interaction/raycast.js';
import { doBreak, updateMining, cancelMining } from './interaction/mining.js';
import { doPlace } from './interaction/placing.js';

import { updateDrops } from './entities/drops.js';
import { spawnMobs, updateMobs, targetedMob, attackMob } from './entities/mobs.js';
import { spawnSettlers, updateNPCs, targetedNPC, interactNPC } from './entities/npc/npc.js';
import { updateDialog } from './entities/npc/dialogue.js';

import { updateDebug } from './ui/hud.js';

// ============================================================ boot sequence
// Mirrors the original file's top-to-bottom order exactly (generateWorld, then find a
// spawn point, position the sun, stream in nearby chunks, create the player, spawn
// mobs/settlers, wire input, kick off the render loop).
generateWorld();

const spawnXZ = findSpawn();
// fixed in world space: exactly due EAST (bearing 90°) from the spawn point
sun.position.set(spawnXZ[0] + 750.5, 380, spawnXZ[1] + 0.5);
ensureNearChunks(spawnXZ[0], spawnXZ[1]);   // build only the regions near the player; the rest stream in as you explore (see animate)

const player = createPlayer(spawnXZ);

spawnMobs(spawnXZ, 60);    // tripled from the original 20 — spread across most of the map, kept well apart (see spawnMobs for the anti-crowd rule)
spawnSettlers(spawnXZ);

initPlayerControls();   // keydown/keyup/resize/pointerlockchange/mousemove/contextmenu — pure input state, no game actions

// ---- hotbar digit-select (a second, independent keydown listener — see player.js for the one that sets `keys`)
document.addEventListener('keydown', e => {
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) selectSlot(+m[1] - 1);
});

document.getElementById('overlay').addEventListener('click', () => {
  SFX.unlock();
  if (!locked) renderer.domElement.requestPointerLock();
});

function tryAct(button, now) {
  const hit = aimHit();
  const ok = button === 0 ? doBreak(hit) : doPlace(hit);
  if (ok) mouseState.lastAct = now;
}

document.addEventListener('mousedown', e => {
  if (!locked) return;
  if (e.button === 0) { mouseState.left = true; const now = performance.now(); if (attackMob()) mouseState.lastAttack = now; else cancelMining(); }  // hold to mine
  if (e.button === 2) { mouseState.right = true; tryAct(2, performance.now()); }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseState.left = false;
  if (e.button === 2) mouseState.right = false;
});

window.addEventListener('wheel', e => {
  selectSlot(selIndex.i + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

// hold-to-repeat mining/placing while the button is kept down
function heldActions() {
  if (!locked) return;
  const now = performance.now();
  if (mouseState.left && now - mouseState.lastAttack > 300) {
    if (interactNPC()) mouseState.lastAttack = now;               // talking to a helper NPC, not attacking
    else if (attackMob()) mouseState.lastAttack = now;             // hold to keep swinging at a mob
   }
  if (mouseState.right && now - mouseState.lastAct > 240) tryAct(2, now);
}

// ============================================================ tool HUD glue
// The device-screen echo panel (#measure) isn't tied to any one tool — it just shows
// whichever registered ToolDevice (inventory/tools/) is currently held, per DEV_HANDOFF.md
// §4. Today that's only the Range Rod; a second tool (Slice 2) plugs in with no changes here.
const measureEl = document.getElementById('measure');
function updateHeldTool(dt) {
  const heldId = inventory[selIndex.i] ? inventory[selIndex.i].id : null;
  const tool = getToolFor(heldId);
  if (!tool || !locked) { measureEl.classList.toggle('show', false); return; }
  measureEl.classList.add('show');
  tool.onUpdate(dt);
  measureEl.textContent = tool.screenText();
}

// ============================================================ main loop
const clock = new THREE.Clock();
let _wasSubmerged = null;   // tracks whether the eye is in water (toggles blue fog / sky visibility)
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  stepPhysics(dt);
  cactusTick();
  heldActions();
  if (targetedMob() || targetedNPC()) cancelMining();    // don't crack the block you're swinging at over a mob/NPC
  updateMobs(dt);
  updateNPCs(dt);
  updateMining(dt);
  updateArm(dt);
  updateDrops(dt);
  updateHurtFlash(dt); updateOxygen(dt); updateEat(dt, triggerArmSwing); updateHunger(dt);
  updateDebug(dt);
  updateHeldTool(dt);
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
