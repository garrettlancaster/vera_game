import * as THREE from 'three';
import SFX from '../sounds.js';
import { AIR, GRASS, DIRT, STONE, WOOD, LEAVES, SAND, CACTUS, TALL_GRASS, blockAt, setBlockRaw } from '../core/voxel-grid.js';
import { rebuildAround } from '../core/chunks.js';
import { scene } from '../core/scene.js';
import { locked, mouseState } from '../player/player.js';
import { aimHit } from './raycast.js';
import { triggerArmSwing } from '../player/arm.js';
import { spawnDrop } from '../entities/drops.js';

// ============================================================ block interaction (breaking)
export function doBreak(hit) {
  if (!hit || hit.y <= 0) return false;   // keep the base layer unbreakable
  const id = blockAt(hit.x, hit.y, hit.z);
  setBlockRaw(hit.x, hit.y, hit.z, AIR);
  rebuildAround(hit.x, hit.z);
  if (id !== TALL_GRASS) spawnDrop(hit.x + 0.5, hit.y + 0.35, hit.z + 0.5, id);   // survival: it drops to the ground (tall grass drops nothing)
  SFX.breakBlock(id);
  triggerArmSwing('break');
  return true;
}

// ============================================================ hold-to-mine (progress + crack overlay)
export const BREAK_TIME = { [GRASS]: 0.7, [DIRT]: 0.5, [STONE]: 1.4, [WOOD]: 1.0, [LEAVES]: 0.35, [SAND]: 0.4, [CACTUS]: 0.6, [TALL_GRASS]: 0.005 };   // tall grass breaks instantly (first frame of the hold)

// Blocky pixelated cracks like real Minecraft: an 8x8 grid of 2px cells on a
// 16x16 canvas (NearestFilter => hard pixels). Cracks are axis-aligned random
// walks seeded ONCE, so every stage draws the same pattern with more of it.
export const CRACK_STAGES = 10;
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

// called from main.js's animate loop when the crosshair is over a mob/NPC instead of a
// block, so a swing at them doesn't also crack whatever block happens to be behind them.
export function cancelMining() { mining = null; miningT = 0; hideCracks(); }

export function updateMining(dt) {
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
