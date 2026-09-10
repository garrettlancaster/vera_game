import SFX from '../sounds.js';
import { MEAT, WATER, blockAt, topSolidY } from '../core/voxel-grid.js';
import { camera } from '../core/scene.js';
import { player, EYE, locked, mouseState, findSpawn, syncCamera } from './player.js';
import { inventory, selIndex, removeOneSelected } from '../inventory/inventory.js';

// NOTE (module-split amendment): this module needs inventory.js (eating consumes a held
// meat stack) — a real coupling the original file already had via shared closures. See
// physics.js's header note; the same "player family depends on inventory" deviation from
// DEV_HANDOFF's original strict layering sketch applies here too.

// ============================================================ hearts HUD + damage
export const MAX_HEALTH = 20, HEART_COUNT = 10;      // each heart is worth 2 health (like vanilla)
export const health = { hp: MAX_HEALTH };            // object wrapper so other modules see live updates
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
export function renderHearts() {
  for (let i = 0; i < HEART_COUNT; i++) drawHeart(heartCanvases[i], Math.max(0, Math.min(2, health.hp - i * 2)) / 2);
}
renderHearts();

// ---- hunger HUD
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
export function updateOxygen(dt) {
  const headBlock = blockAt(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
  const sub = locked && headBlock === WATER;   // fully under water (head below surface); hidden in menus like the arm
  oxygenEl.classList.toggle('show', sub);
  if (!sub) { if (oxygen !== OXYGEN_MAX) { oxygen = OXYGEN_MAX; o2DrainT = 0; drownDmgT = 0; renderOxygen(); } return; }   // refill on the surface, like vanilla's fast recovery
  o2DrainT += dt;
  let changed = false;
  while (o2DrainT >= O2_DRAIN_SEC && oxygen > 0) { o2DrainT -= O2_DRAIN_SEC; oxygen--; changed = true; }   // count down one bubble at a time
  if (changed) renderOxygen();
  if (oxygen <= 0) { drownDmgT += dt; while (drownDmgT >= DROWN_SEC && health.hp > 0) { drownDmgT -= DROWN_SEC; takeDamage(2); SFX.hurt(); } }   // 2 HP = one heart per second (with a hurt oof)
}

// ---- hunger: drains over time, faster when moving / sprinting; refilled by eating meat
export const HUNGER_MAX = 10;                // one bar per unit (== HUNGER_COUNT icons)
let hunger = HUNGER_MAX;                     // fractional 0..HUNGER_MAX -> bars drop off one by one as it falls
export const HUNGER_DRAIN = { idle: HUNGER_MAX/3600, walk: HUNGER_MAX/1200, run: HUNGER_MAX/600 };   // full->empty in ~1h / ~20min / ~10min
// `level` mirrors `hunger` on every change below — the tally slate (inventory/tools/
// tally-slate.js) reads it for its plain-language rate projection; kept as a field on
// the same exported object as `mode` rather than a new export, same pattern as `health`.
export const hungerState = { mode: 'idle', level: HUNGER_MAX };

function renderHunger() { for (let i = 0; i < HUNGER_COUNT; i++) drawMeat(hungerEl.children[i], i < hunger); }
export function updateHunger(dt) {
  if (!locked || health.hp <= 0) return;
  const before = hunger;
  hunger = Math.max(0, hunger - HUNGER_DRAIN[hungerState.mode] * dt);
  hungerState.level = hunger;
  if (Math.floor(before) !== Math.floor(hunger)) renderHunger();   // repaint only when a bar crosses an integer boundary
}

// ---- eating meat: hold right-click for EAT_TIME while holding meat in the selected slot -> +EAT_GAIN bars
const EAT_TIME = 1.5, EAT_GAIN = 2;
let eatT = 0;                                // seconds of continuous hold so far
let munchT = 0;                              // cadence timer for the repeated chewing sounds while holding food
const MUNCH_INTERVAL = 0.2;                  // one chew bite every ~0.2s -> ~8 chews over a full 1.5s eat
export const eatState = { held: false };     // drives the arm's "eating" hand swing in updateArm
export function updateEat(dt, triggerArmSwing) {
  if (!locked || health.hp <= 0) { eatT = 0; munchT = 0; eatState.held = false; return; }
  const st = inventory[selIndex.i];
  const canEat = mouseState.right && st && st.id === MEAT && hunger < HUNGER_MAX - 1e-6;   // holding meat and not already full
  if (canEat) {
    eatState.held = true;                    // swing the hand just like while mining / breaking blocks
    eatT += dt;
    munchT += dt;                            // chew continuously WHILE holding, so you hear it as it happens
    while (munchT >= MUNCH_INTERVAL) { munchT -= MUNCH_INTERVAL; SFX.chew(); }
    if (eatT >= EAT_TIME) {
      hunger = Math.min(HUNGER_MAX, hunger + EAT_GAIN); hungerState.level = hunger; renderHunger();
      removeOneSelected();                   // consume one meat from the held slot (updates hand + hotbar)
      if (triggerArmSwing) triggerArmSwing('break');   // a little strike as it lands in your mouth
      eatT = 0; munchT = 0;
    }
  } else { eatT = 0; munchT = 0; eatState.held = false; }
}

const hurtEl = document.getElementById('hurt');
export function takeDamage(n) {
  if (health.hp <= 0) return;
  health.hp = Math.max(0, health.hp - n);
  hurtFlashT = 0.5;
  renderHearts();
  if (health.hp <= 0) die();
}

const deadEl = document.getElementById('deadmsg');
export function respawnPlayer() {
  const [rx, rz] = findSpawn();
  player.pos.set(rx + 0.5, topSolidY(rx, rz) + 1 + EYE + 0.02, rz + 0.5);
  player.vy = 0;
}
function die() {
  deadEl.classList.remove('show'); void deadEl.offsetWidth; deadEl.classList.add('show');
  health.hp = MAX_HEALTH; renderHearts();        // respawn at full (items kept - keep it friendly)
  respawnPlayer();
  syncCamera();
}

// red vignette flash when taking damage
let lastHurtOpacity = -1;
export function updateHurtFlash(dt) {
  if (hurtFlashT > 0) hurtFlashT -= dt;
  const o = Math.max(0, Math.min(1, hurtFlashT / 0.5)) * 0.8;
  if (o !== lastHurtOpacity) { hurtEl.style.opacity = String(o); lastHurtOpacity = o; }
}
