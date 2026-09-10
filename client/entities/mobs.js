import * as THREE from 'three';
import SFX from '../sounds.js';
import { W, GRASS, DIRT, SAND, MEAT, WL, WATER, inBounds, blockAt, solidForPhysics, topSolidY } from '../core/voxel-grid.js';
import { scene, camera } from '../core/scene.js';
import { GRAVITY } from '../physics/physics.js';
import { triggerArmSwing } from '../player/arm.js';
import { spawnDrop } from './drops.js';

// ============================================================ mobs (friendly passives: cow, sheep, chicken)
export const MOBS = [];
const _mv = new THREE.Vector3();   // reused view-direction vector

export const MOB_TYPES = {
  cow:     { w:0.9,  h:1.5, len:1.7, half:0.42, hp:24, jump:4.2, speed:[1.1,2.1], meat:3, bodyC:0xded2bd, headC:0xb0946f },
  sheep:   { w:0.85, h:1.2, len:1.3, half:0.40, hp:18, jump:5.0, speed:[1.0,1.9], meat:2, bodyC:0xf1ece0, headC:0xcbb48f },
  chicken: { w:0.5,  h:0.7, len:0.6, half:0.26, hp:8,  jump:7.0, speed:[1.3,2.5], meat:1, bodyC:0xf3d24b, headC:0xe9c23e },
};

function makeMobMesh(type) {
  const T = MOB_TYPES[type];
  const g = new THREE.Group();
  const parts = [];   // every coloured box we can flash on a hit
  const addBox = (w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z); g.add(m); parts.push({ m, base: c }); return m;
  };

  // ---- cow: two-tone body (cream belly / dark brown back), head with snout, ears, eyes, hooves and a tail
  if (type === 'cow') {
    const patch = 0x6e4f33;                                     // the dark coat patches
    for (const [ox, oz] of [[-0.26,-0.48],[0.26,-0.48],[-0.26,0.48],[0.26,0.48]]) {  // four legs + hooves
      addBox(0.18, 0.56, 0.18, ox, 0.34, oz, 0xa78a5f);
      addBox(0.20, 0.10, 0.20, ox, 0.07, oz, 0x322b24);
    }
    addBox(0.86, 0.54, T.len * 0.72, 0, 0.62, 0, T.bodyC);      // lower torso (cream)
    addBox(0.90, 0.30, T.len * 0.75, 0, 1.00, 0, patch);        // back band (brown)
    addBox(0.92, 0.26, 0.45,   0, 0.66, -0.20, patch);          // flank patch
    addBox(0.40, 0.36, 0.40,   0, 1.10, 0.85, T.headC);         // head (meets the body -> neck)
    addBox(0.30, 0.18, 0.14,   0, 0.96, 1.08, 0xd9c39a);        // light snout on the front
    for (const sx of [-1, 1]) {                                 // ears + eyes
      addBox(0.10, 0.12, 0.22, sx * 0.25, 1.26, 0.80, patch);
      addBox(0.05, 0.09, 0.06, sx * 0.21, 1.13, 0.98, 0x201a15);
    }
    addBox(0.05, 0.34, 0.07,   0, 1.02, -0.76, patch);          // tail
    addBox(0.10, 0.16, 0.12,   0, 0.80, -0.79, 0x3a2d1e);       // dark tail tuft
  }

  // ---- sheep: lumpy wool (several same-colour boxes for a clumpy silhouette), short tan legs, small face with ears + eyes
  else if (type === 'sheep') {
    const fleece = T.bodyC;                                     // the fluffy white coat
    for (const [ox, oz] of [[-0.24,-0.34],[0.24,-0.34],[-0.24,0.34],[0.24,0.34]]) {   // four legs + hooves
      addBox(0.16, 0.40, 0.16, ox, 0.20, oz, 0xa98a63);
      addBox(0.17, 0.08, 0.17, ox, 0.05, oz, 0x3d342b);
    }
    addBox(0.72, 0.56, T.len * 0.68, 0, 0.64, 0, fleece);       // main wool mass
    addBox(0.78, 0.16, 0.34,         0, 0.95, -0.20, fleece);   // lumps along the back...
    addBox(0.78, 0.16, 0.34,         0, 0.95,  0.20, fleece);   // ...and rump
    for (const sx of [-1, 1])                                   // fluffs down the sides -> rounded look
      addBox(0.14, 0.44, 0.60, sx * 0.40, 0.60, 0, fleece);
    addBox(0.28, 0.30, 0.30,   0, 0.92, 0.60, T.headC);         // small tan head
    addBox(0.30, 0.10, 0.18,   0, 1.09, 0.50, fleece);          // wool tuft on the crown
    for (const sx of [-1, 1]) {                                 // droopy ears + eyes
      addBox(0.16, 0.07, 0.20, sx * 0.19, 0.94, 0.58, 0xb3946a);
      addBox(0.04, 0.08, 0.05, sx * 0.148, 0.95, 0.62, 0x201a15);
    }
  }

  // ---- chicken: plump body with wings and a fanned tail, tiny legs & feet, head with three-bump comb, two-part beak, wattle and eyes
  else if (type === 'chicken') {
    const accent = 0xcfa12f;                                    // deeper gold for wing / tail feathers
    for (const sx of [-1, 1]) {                                 // thin legs + little feet
      addBox(0.05, 0.16, 0.05, sx * 0.09, 0.08, 0.02, 0xd8a44a);
      addBox(0.05, 0.03, 0.14, sx * 0.09, 0.015, 0.07, 0xd8a44a);
    }
    addBox(0.44, 0.30, T.len * 0.60, 0, 0.32, -0.03, T.bodyC);  // plump body
    for (const sx of [-1, 1])                                   // wings hugging the sides
      addBox(0.05, 0.18, 0.26, sx * 0.245, 0.35, -0.04, accent);
    addBox(0.30, 0.12, 0.16,   0, 0.47, -0.26, T.bodyC);        // fanned tail (lower + upper feather)
    addBox(0.20, 0.10, 0.12,   0, 0.55, -0.24, accent);
    addBox(0.20, 0.19, 0.20,   0, 0.57, 0.24, T.headC);         // head (overlaps the chest -> neck)
    addBox(0.06, 0.11, 0.06,   0, 0.71, 0.20, 0xe23b2e);        // comb: tall centre bump...
    for (const sx of [-1, 1]) addBox(0.05, 0.08, 0.05, sx * 0.055, 0.69, 0.20, 0xe23b2e);   // ...+ two smaller
    addBox(0.10, 0.045, 0.12,  0, 0.585, 0.40, 0xf2a93b);       // beak (upper...
    addBox(0.07, 0.035, 0.10,  0, 0.545, 0.39, 0xf2a93b);       // ...+ lower part)
    addBox(0.05, 0.06, 0.04,   0, 0.50, 0.36, 0xe23b2e);        // little red wattle under the beak
    for (const sx of [-1, 1]) addBox(0.035, 0.07, 0.045, sx * 0.108, 0.60, 0.30, 0x201a15); // eyes
  }

  g.userData.parts = parts;
  return g;
}

function addMob(type, x, y, z) {
  const T = MOB_TYPES[type];
  const group = makeMobMesh(type);
  group.position.set(x, y, z);
  scene.add(group);
  MOBS.push({
    type, pos: new THREE.Vector3(x, y, z), vy: 0,
    dirAngle: Math.random() * Math.PI * 2, speed: 0, faceYaw: 0,
    half: T.half, radius: Math.max(T.w, T.len) / 2 + 0.18, height: T.h, meat: T.meat,
    hp: T.hp, alive: true, airborne: false, hitT: 0, wanderT: Math.random() * 2, idleT: 0, group, parts: group.userData.parts,
  });
}

// spawnXZ is passed in rather than imported: mob spawning happens once, from main.js's
// boot sequence, right after findSpawn() runs — see IMPLEMENTATION_PLAN.md's Slice A log.
export function spawnMobs(spawnXZ, count) {
  const types = ['cow', 'sheep', 'chicken'];
  // scatter over most of the map, not just one corner around the player spawn
  const spread = Math.min(150, W / 2 - 6);
  let made = 0, tries = 0;
  while (made < count && tries < count * 400) {   // wide area + land-only filter means lots of rejects
    tries++;
    const tx = Math.floor(spawnXZ[0] + (Math.random() * 2 - 1) * spread);
    const tz = Math.floor(spawnXZ[1] + (Math.random() * 2 - 1) * spread);
    if (!inBounds(tx, 3, tz)) continue;
    const hgt = topSolidY(tx, tz);
    if (hgt < WL + 1) continue;                                  // land only, above the water level
    const surf = blockAt(tx, hgt, tz);
    if (surf !== GRASS && surf !== DIRT && surf !== SAND) continue;   // dry ground
    let crowded = false;                                         // keep a minimum distance apart -> no herds in one spot
    for (const o of MOBS) if (o.alive && Math.abs(o.pos.x - (tx + 0.5)) < 14 && Math.abs(o.pos.z - (tz + 0.5)) < 14) { crowded = true; break; }
    if (crowded) continue;
    addMob(types[made % types.length], tx + 0.5, hgt + 1 + 0.02, tz + 0.5);
    made++;
  }
}

function killMob(m) {
  if (!m.alive) return;
  m.alive = false;
  scene.remove(m.group);
  for (const ch of m.group.children) ch.geometry.dispose();
  // drop its meat - falls to the ground and can be picked up like any other item
  for (let i = 0; i < m.meat; i++)
    spawnDrop(m.pos.x + (Math.random() - 0.5) * 0.8, m.pos.y + 0.4, m.pos.z + (Math.random() - 0.5) * 0.8, MEAT);
}

// would standing at (x,z) clip a wall/tree or step into the water?
function mobBlocked(m, x, z) {
  const r = m.half;
  for (const [ox, oz] of [[-r,-r],[r,-r],[-r,r],[r,r]]) {
    const bx = Math.floor(x + ox), bz = Math.floor(z + oz);
    if (!inBounds(bx, 0, bz)) return true;                       // treat the map edge as a wall
    // a one-block step up is climbable (the vertical easing below handles it) - only higher terrain blocks
    const climbsOver = topSolidY(bx, bz) + 1 > m.pos.y + 1.05;
    if ((solidForPhysics(bx, Math.floor(m.pos.y + 0.2), bz) || solidForPhysics(bx, Math.floor(m.pos.y + m.height * 0.5), bz)) && climbsOver) return true;
  }
  if (blockAt(Math.floor(x), Math.floor(m.pos.y), Math.floor(z)) === WATER) return true;   // don't wade in
  return false;
}

export function updateMobs(dt) {
  for (const m of MOBS) {
    if (!m.alive) continue;

    // pick a heading: wander around, pausing now and then to stand still
    m.wanderT -= dt;
    if (m.idleT > 0) { m.idleT -= dt; m.speed = 0; }
    else if (m.wanderT <= 0) {
      if (Math.random() < 0.12) m.idleT = 0.4 + Math.random() * 1.6;   // shorter, rarer pauses -> more on the move
      else {
        m.dirAngle = Math.random() * Math.PI * 2;
        const T = MOB_TYPES[m.type];
        m.speed = T.speed[0] + Math.random() * (T.speed[1] - T.speed[0]);
        m.wanderT = 3 + Math.random() * 5;   // longer walks before re-picking a heading
      }
    }

    // horizontal: axis by axis, bounce the heading if we'd clip something
    const ca = Math.cos(m.dirAngle), sa = Math.sin(m.dirAngle);
    if (m.speed > 0) {
      const nx = m.pos.x + ca * m.speed * dt;
      if (!mobBlocked(m, nx, m.pos.z)) m.pos.x = nx; else m.dirAngle += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random());   // steer around the obstacle instead of re-rolling a random heading
      const nz = m.pos.z + sa * m.speed * dt;
      if (!mobBlocked(m, m.pos.x, nz)) m.pos.z = nz; else m.dirAngle += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random());   // steer around the obstacle instead of re-rolling a random heading
    }

    // vertical: ease onto the terrain; use gravity only for genuine falls into gaps
    const fx = Math.floor(m.pos.x), fz = Math.floor(m.pos.z);
    const surfY = inBounds(fx, 0, fz) ? topSolidY(fx, fz) + 1 : m.pos.y;
    if (m.airborne) {   // hit-hop: gravity until it settles back onto the terrain
        m.vy -= GRAVITY * dt; if (m.vy < -28) m.vy = -28;
        let ny = m.pos.y + m.vy * dt;
        if (ny <= surfY) { ny = surfY; m.vy = 0; m.airborne = false; }
        m.pos.y = ny;
      } else if (surfY - m.pos.y > 1.05) {
      m.vy = 0;                                             // can't rise more than one block: no floating up walls / tree trunks
    } else {
      m.pos.y += (surfY - m.pos.y) * Math.min(1, dt * 12);   // step up (max 1 block) / sink down smoothly
      m.vy = 0;
    }

    // face the way we're moving, with a little turn-inertia
    const targetYaw = Math.atan2(ca, sa);
    let dyaw = ((targetYaw - m.faceYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    m.faceYaw += dyaw * Math.min(1, dt * 6);

    // hit flash: tint red briefly, then ease back to the base colours
    if (m.hitT > 0) { m.hitT -= dt; const on = m.hitT > 0; for (const p of m.parts) p.m.material.color.setHex(on ? 0xff5346 : p.base); }
    else for (const p of m.parts) if (p.m.material.color.getHex() !== p.base) p.m.material.color.setHex(p.base);

    m.group.position.copy(m.pos);
    m.group.rotation.y = m.faceYaw;
  }
}

// which mob is the crosshair over? (nearest along the view ray within reach)
const MOB_REACH = 5;
export function targetedMob() {
  camera.getWorldDirection(_mv);   // normalised world-space view direction (-z)
  let best = null, bestT = Infinity;
  for (const m of MOBS) {
    if (!m.alive) continue;
    const cx = m.pos.x - camera.position.x, cy = m.pos.y + m.height * 0.5 - camera.position.y, cz = m.pos.z - camera.position.z;
    const dist = Math.hypot(cx, cy, cz);
    if (dist > MOB_REACH || dist < 0.01) continue;
    const dot = (cx * _mv.x + cy * _mv.y + cz * _mv.z) / dist;          // cosine of the aim angle
    if (dist * Math.sqrt(Math.max(0, 1 - dot * dot)) > m.radius) continue;   // crosshair off-target -> miss
    const tproj = cx * _mv.x + cy * _mv.y + cz * _mv.z;                 // distance along the ray
    if (tproj < bestT) { bestT = tproj; best = m; }
  }
  return best;
}

export function attackMob() {   // one swing at whatever's being aimed at. true on a hit
  const m = targetedMob();
  if (!m) return false;
  m.hp -= 5; m.hitT = 0.18;
  SFX.mobHurt(m.type);                       // each species yelps differently
  {                                          // little hop - only when standing on the ground
    const gY = inBounds(Math.floor(m.pos.x), 0, Math.floor(m.pos.z)) ? topSolidY(Math.floor(m.pos.x), Math.floor(m.pos.z)) + 1 : m.pos.y;
    if (!m.airborne && m.pos.y <= gY + 0.25) { m.vy = MOB_TYPES[m.type].jump; m.airborne = true; }
  }
  triggerArmSwing('break');
  if (m.hp <= 0) killMob(m);
  return true;
}
