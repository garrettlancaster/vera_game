import * as THREE from 'three';
import { camera } from '../core/scene.js';
import { toTexture } from '../core/textures.js';
import { materials } from '../core/textures.js';
import { materialKey } from '../core/chunks.js';
import { ITEM_INFO } from '../inventory/inventory.js';
import { player, locked, mouseState } from './player.js';
import { eatState } from './stats.js';

// ============================================================ first-person arm (Minecraft style)
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

export function addArmBox(w, h, d, x, y, z, mat, order) {
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
// Exported as an object (not two bare lets) so tools/range-rod.js sees live updates across
// the module boundary without needing a setter.
export const toolScreen = { ctx: null, tex: null };
function disposeHeld() {
  if (!heldMesh) return;
  armRoot.remove(heldMesh);
  if (heldMesh.geometry) heldMesh.geometry.dispose();
  else for (const ch of heldMesh.children) { if (ch.geometry) ch.geometry.dispose(); if (ch.material && ch.material.map) ch.material.map.dispose(); }
  heldMesh = null; toolScreen.ctx = null; toolScreen.tex = null;
}
export function setHeldItem(id) {
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
  toolScreen.ctx = sc.getContext('2d');
  toolScreen.tex = toTexture(sc);
  part(0.20, 0.10, 0.03, 0, 0.11, 0.11, new THREE.MeshBasicMaterial({ map: toolScreen.tex, fog: false, depthTest: false, depthWrite: false, transparent: true })); // readout screen
  g.position.set(0.16, 1.30, 0.16);
  g.renderOrder = 101;
  heldMesh = g;
  armRoot.add(g);
}
// survival: the hand starts empty - items only come from what you mine (or a helper hands you a tool)
heldItemId = null;

// ---- arm animation: mining swing, break strike, place poke, walk bob + idle breathing
let mineT = 0, breakAnimT = 99, placeAnimT = 99, armBobPhase = 0, armClock = 0;
export function triggerArmSwing(kind) { if (kind === 'break') breakAnimT = 0; else placeAnimT = 0; }

const ARM_BASE_Y = -1.20;
export function updateArm(dt) {
  armRoot.visible = locked; // hidden in menus, like vanilla
  if (!locked) return;
  armClock += dt;

  const mv = player._moveAmt || 0;
  armBobPhase += mv * 2.9;
  const speedF = Math.min(1, mv / 0.055);
  const bobY = Math.sin(armBobPhase) * 0.024 * speedF + Math.sin(armClock * 1.6) * 0.005;

  let swingX = -0.05; // slight resting tilt
  if (mouseState.left || eatState.held) {   // mining OR eating share the same continuous hand swing
    mineT += dt;
    swingX += 0.44 * Math.sin(mineT * 23.5) + 0.12;   // continuous mining swing ~3.7 Hz
  } else mineT = 0;
  if (breakAnimT < 0.16) { breakAnimT += dt; swingX -= 0.8 * Math.sin(Math.PI * breakAnimT / 0.16); }  // quick strike down
  if (placeAnimT < 0.12) { placeAnimT += dt; swingX -= 0.5 * Math.sin(Math.PI * placeAnimT / 0.12); }  // short poke forward

    const swingTotal = swingX + Math.sin(armBobPhase) * 0.03 * speedF + ((mouseState.left || eatState.held) ? 0.05 * Math.sin(mineT * 23.5 + 1.3) : 0);
    armRoot.quaternion.copy(ARM_SWING_Q.setFromAxisAngle(_AXIS_X, swingTotal)).multiply(ARM_BASE_Q);
  armRoot.position.y = ARM_BASE_Y + bobY;
}
