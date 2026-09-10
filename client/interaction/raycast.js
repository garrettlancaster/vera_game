import * as THREE from 'three';
import { AIR, WATER, blockAt } from '../core/voxel-grid.js';
import { REACH } from '../player/player.js';
import { camera } from '../core/scene.js';

// ============================================================ voxel raycast (Amanatides & Woo DDA)
export function raycastVoxel(origin, dir, maxDist = REACH) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const hitSolid = (bx, by, bz) => { const id = blockAt(bx, by, bz); return id !== AIR && id !== WATER; };
  if (hitSolid(x, y, z)) return { x, y, z, nx: 0, ny: 1, nz: 0 }; // started inside a solid block

  const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
  const tDX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tMaxX = dir.x > 0 ? (x + 1 - origin.x) * tDX : dir.x < 0 ? (origin.x - x) * tDX : Infinity;
  let tMaxY = dir.y > 0 ? (y + 1 - origin.y) * tDY : dir.y < 0 ? (origin.y - y) * tDY : Infinity;
  let tMaxZ = dir.z > 0 ? (z + 1 - origin.z) * tDZ : dir.z < 0 ? (origin.z - z) * tDZ : Infinity;

    // cap raised 256->1024 so the measure tool's long look (300 blocks) reaches far
    // terrain; mining uses maxDist=6 and returns via the tMax>maxDist check long before
    // the cap, so gameplay is unaffected.
  for (let i = 0; i < 1024; i++) {
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      if (tMaxX > maxDist) return null;
      const px = x, py = y, pz = z;   // cell we're leaving = placement target
      x += stepX; tMaxX += tDX;
      if (hitSolid(x, y, z)) return { x, y, z, nx: px - x, ny: 0, nz: 0 };
    } else if (tMaxY <= tMaxZ) {
      if (tMaxY > maxDist) return null;
      const px = x, py = y, pz = z;
      y += stepY; tMaxY += tDY;
      if (hitSolid(x, y, z)) return { x, y, z, nx: 0, ny: py - y, nz: 0 };
    } else {
      if (tMaxZ > maxDist) return null;
      const px = x, py = y, pz = z;
      z += stepZ; tMaxZ += tDZ;
      if (hitSolid(x, y, z)) return { x, y, z, nx: 0, ny: 0, nz: pz - z };
    }
  }
  return null;
}

export function aimHit() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return raycastVoxel(camera.position, dir);
}
