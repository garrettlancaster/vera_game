import SFX from '../sounds.js';
import { W, D, AIR, TALL_GRASS, DIRT, WATER, CACTUS, blockAt, solidForPhysics } from '../core/voxel-grid.js';
import { player, EYE, PHEIGHT, PHALF, keys, locked, syncCamera, findSpawn } from '../player/player.js';
import { takeDamage, respawnPlayer, health, hungerState } from '../player/stats.js';

// NOTE (module-split amendment, see IMPLEMENTATION_PLAN.md Slice A): DEV_HANDOFF.md's
// table put stepPhysics/cactusTick's home implicitly under "player" — in practice they
// are the per-frame *physics integration* of the player against the world, so they live
// here instead, and player.js stays pure data (the player object + input state). This
// module ends up depending on player/stats.js (for damage/respawn side effects and the
// hunger-mode signal), which is a real coupling the original file already had via shared
// closures — documented as a deliberate deviation from the original layering sketch.

// player movement tuning
const GRAVITY = 26, JUMP_V = 8.4, WALK_SPEED = 4.4, SPRINT_MULT = 1.55;
// swimming (simplified Minecraft): slower horizontal speed in water, weak gravity,
// Space floats you back to the surface, Shift makes you dive down
const SWIM_SPEED_MULT = 0.62,   // swim speed vs land walk (vanilla-ish "much slower")
      WATER_GRAV_MULT = 0.35,   // scaled-down gravity while any part of the body is in water
      WATER_FALL_CAP = -4.2,    // max sink speed passively — falling into water never hurts / kills
      SWIM_RISE_SPEED = 2.9;    // upward velocity you accelerate toward while holding Space

// ============================================================ sound hooks
const STEP_DIST = 2.1;      // world units travelled per footstep
let stepAccum = 0;
export function surfaceUnderFoot() {
  const fy = Math.floor(player.pos.y - EYE - 0.2);     // block just under the soles (feet rest ~0.02 above the surface)
  for (const [ox, oz] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
    const id = blockAt(Math.floor(player.pos.x + ox), fy, Math.floor(player.pos.z + oz));
    if (id !== AIR && id !== TALL_GRASS) return id;   // walk-through grass is not "solid underfoot"
  }
  return DIRT;                                          // no solid underfoot — treat as dirt
}

export function collides(p) {
  const minx = p.x - PHALF, maxx = p.x + PHALF;
  const miny = p.y - EYE,    maxy = p.y - EYE + PHEIGHT;
  const bx0 = Math.floor(minx), bx1 = Math.floor(maxx - 1e-7);
  const by0 = Math.floor(miny), by1 = Math.floor(maxy - 1e-7);
  const bz0 = Math.floor(p.z - PHALF), bz1 = Math.floor(p.z + PHALF - 1e-7);
  for (let y = by0; y <= by1; y++)
    for (let z = bz0; z <= bz1; z++)
      for (let x = bx0; x <= bx1; x++)
        if (solidForPhysics(x, y, z)) return true;
  return false;
}

export function collidesAt(axis, val) {
  const p = player.pos;
  const saved = p[axis];
  p[axis] = val;
  const hit = collides(p);
  p[axis] = saved;
  return hit;
}

// Move along one axis with binary-search snap-back. Returns true if blocked.
export function moveAxis(axis, to) {
  const from = player.pos[axis];
  if (from === to) return false;
  if (!collidesAt(axis, to)) { player.pos[axis] = to; return false; }
  let lo = from, hi = to;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (collidesAt(axis, mid)) hi = mid; else lo = mid;
  }
  player.pos[axis] = lo;
  return true;
}

// ============================================================ per-frame physics
export function stepPhysics(dt) {
  if (!locked) return; // frozen until the mouse is captured

  const forward = keys['KeyW'], back = keys['KeyS'];
  const strafeL = keys['KeyA'], strafeR = keys['KeyD'];
  // ---- swimming state: is any part of our body in a water block? (simplified Minecraft)
  const swX = Math.floor(player.pos.x), swZ = Math.floor(player.pos.z);
  const bodyInWater = blockAt(swX, Math.floor(player.pos.y - EYE + 0.5), swZ) === WATER;   // torso/feet
  const headInWater = blockAt(swX, Math.floor(player.pos.y - 0.3), swZ) === WATER;        // head
  const inSwim = bodyInWater || headInWater;

  const sprinting = (keys['ShiftLeft'] || keys['ShiftRight']) && forward && !inSwim;   // no sprint underwater

  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let dx = 0, dz = 0;
  if (forward) { dx += -sy; dz += -cy; }   // camera forward on the ground plane
  if (back)    { dx +=  sy; dz +=  cy; }
  if (strafeR) { dx +=  cy; dz += -sy; }   // right = forward × up... verified: (cos y, 0, -sin y)
  if (strafeL) { dx += -cy; dz +=  sy; }
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }

  const speed = inSwim ? WALK_SPEED * SWIM_SPEED_MULT : WALK_SPEED * (sprinting ? SPRINT_MULT : 1);   // much slower swimming underwater

  // horizontal: one axis at a time with snap-back collision
  const px = player.pos.x, pz = player.pos.z;
  moveAxis('x', player.pos.x + dx * speed * dt);
  moveAxis('z', player.pos.z + dz * speed * dt);
  player._moveAmt = Math.hypot(player.pos.x - px, player.pos.z - pz); // for the arm's walk bob
  hungerState.mode = sprinting ? 'run' : (player._moveAmt > 0.01) ? 'walk' : 'idle';   // drives the hunger drain rate

  // vertical
  if (inSwim) {
    // underwater: weak gravity, and sinking never gets faster than a gentle glide - falling in is safe
    player.vy -= GRAVITY * WATER_GRAV_MULT * dt;
    const diving = keys['ShiftLeft'] || keys['ShiftRight'];
    if (keys['Space']) {            // hold Space to swim up toward the surface
      player.vy += (SWIM_RISE_SPEED - player.vy) * Math.min(1, dt * 6);
    } else if (diving) {            // hold Shift to dive down to the bottom
      player.vy -= GRAVITY * 0.5 * dt;
      if (player.vy < WATER_FALL_CAP - 2) player.vy = WATER_FALL_CAP - 2;
    } else if (headInWater) {       // fully submerged with no input: buoyancy floats you back up
      player.vy = Math.min(player.vy + 2.5 * dt, 1.8);
    }
    if (player.vy < WATER_FALL_CAP) player.vy = WATER_FALL_CAP;
  } else {
    player.vy -= GRAVITY * dt;
    if (player.vy < -48) player.vy = -48;
  }
  if (keys['Space'] && player.onGround) { player.vy = JUMP_V; SFX.jump(); }   // a full jump also works in shallow water: hop out over ledges/banks

  const hitY = moveAxis('y', player.pos.y + player.vy * dt);
  player.onGround = false;
  if (hitY && player.vy <= 0) {
    const impact = -player.vy;                 // fall speed at the moment of landing
    player.onGround = true; player.vy = 0;
    if (impact > 7) SFX.land((impact - 7) / 28);   // hard landings thud + dust kick-up
    const fallen = impact * impact / (2 * GRAVITY);   // approx block count of the fall
    if (fallen > 4 && health.hp > 0) takeDamage(Math.max(1, Math.round(fallen - 3)));  // safe up to a ~3-block drop, like vanilla
  }
  else if (hitY) player.vy = 0; // bonked head

  // footsteps: cadence follows distance travelled, so sprinting steps faster for free
  if (player.onGround && !inSwim) {   // no footstep sounds while wading/swimming
    stepAccum += Math.hypot(player.pos.x - px, player.pos.z - pz);
    if (stepAccum >= STEP_DIST) { stepAccum = 0; SFX.footstep(surfaceUnderFoot()); }
  } else stepAccum = 0;

  // safety: keep inside the map horizontally, respawn if we ever fall out of the world
  const p = player.pos;
  p.x = Math.max(PHALF + 0.01, Math.min(W - PHALF - 0.01, p.x));
  p.z = Math.max(PHALF + 0.01, Math.min(D - PHALF - 0.01, p.z));
  if (p.y < -20) { // fell out somehow — respawn somewhere safe
    takeDamage(999);          // the void is lethal - die() respawns at spawn with full hearts
    respawnPlayer();
  }

  syncCamera();
}

// ---- cacti hurt like vanilla: one heart per touch, plus a shove/hop out of them
let lastCactusT = -1e9;
export function cactusTick() {
  const p = player.pos;
  if (health.hp <= 0) return;
  const bx0 = Math.floor(p.x - PHALF), bx1 = Math.floor(p.x + PHALF);
  const by0 = Math.floor(p.y - EYE),   by1 = Math.floor(p.y - EYE + PHEIGHT);
  const bz0 = Math.floor(p.z - PHALF), bz1 = Math.floor(p.z + PHALF);
  let cx, cy, cz;
  outer: for (let y = by0; y <= by1; y++)
    for (let z = bz0; z <= bz1; z++)
      for (let x = bx0; x <= bx1; x++)
        if (blockAt(x, y, z) === CACTUS) { cx = x; cy = y; cz = z; break outer; }
  if (cx === undefined) return;
  const now = performance.now();
  if (now - lastCactusT > 300) {         // short mercy window so standing in thorns isn't instant death
    lastCactusT = now;
    takeDamage(2);                       // one heart, like vanilla cacti
    SFX.cactusHurt();
  }
  // push out toward whichever side is freer and hop up a bit so you land clear of it
  const dirx = p.x - (cx + 0.5), dirz = p.z - (cz + 0.5);
  if (Math.abs(dirx) >= Math.abs(dirz)) {
    const to = p.x + Math.sign(dirx || 1) * 0.45;
    if (!collidesAt('x', to)) player.pos.x = to;
  } else {
    const to = p.z + Math.sign(dirz || -1) * 0.45;
    if (!collidesAt('z', to)) player.pos.z = to;
  }
  player.vy = Math.max(player.vy, 6.5);
}
