import * as THREE from 'three';
import { RANGE_ROD, topSolidY } from '../../core/voxel-grid.js';
import { camera } from '../../core/scene.js';
import { toolScreen } from '../../player/arm.js';
import { raycastVoxel } from '../../interaction/raycast.js';
import { registerTool } from './tool-device.js';

// ============================================================ range rod (legibility, via a tool)
// The first "math is in the world" surface — but it's a *tool you earn*, not a HUD you're
// handed. Holding the Range Rod (selected in the hotbar) reads the distance and vertical
// scale of the world, magnitude-rounded: a long way across the map reads in tens, not to
// the block, because precision at that scale is an illusion and the point is number sense,
// not an exact answer. The reading is drawn on the rod's screen and echoed in a small panel.

// magnitude-aware rounding: small distances read exactly, large ones coarser
export function rough(n) {
  const a = Math.abs(n);
  if (a < 10)  return Math.round(n);
  if (a < 100) return Math.round(n / 5) * 5;
  if (a < 500) return Math.round(n / 10) * 10;
  return Math.round(n / 25) * 25;
}
// a plain magnitude word, so the reading is a *feel*, not just a figure
export function rangeBand(n) {
  const a = Math.abs(n);
  if (a < 6)   return 'next to you';
  if (a < 20)  return 'a short way off';
  if (a < 60)  return 'a long way';
  if (a < 200) return 'across the map';
  return 'far beyond sight';
}

// draw the rod's LCD: a couple of "LED bars" for the range magnitude (visual — the panel
// holds the legible figures). Called every frame the rod is held.
function paintToolScreen(range, rise) {
  if (!toolScreen.ctx) return;
  const g = toolScreen.ctx;
  g.fillStyle = '#04140c'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#39d97a';
  const mag = range == null ? 0 : Math.max(0.06, Math.min(1, rough(range) / 200));
  g.fillRect(3, 7, 26 * mag, 4);
  if (rise != null) {
    const rr = Math.max(0, Math.min(1, (rise + 20) / 40));
    g.fillRect(3, 23, 26 * rr, 4);
   }
  toolScreen.tex.needsUpdate = true;
}

let lastReading = { range: null, rise: null };
function onUpdate() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
    // look far out: the rod is about the world, not the 6-block mining reach
  const hit = raycastVoxel(camera.position, dir, 300);
  const feetLevel = topSolidY(Math.floor(camera.position.x), Math.floor(camera.position.z));

  let range = null, rise = null;
  if (hit) {
    const tx = hit.x + 0.5, ty = hit.y + 0.5, tz = hit.z + 0.5;      // block face you're looking at
    range = Math.hypot(tx - camera.position.x, ty - camera.position.y, tz - camera.position.z);
    rise    = topSolidY(hit.x, hit.z) - feetLevel;                   // vertical magnitude vs. where you stand
   }
  lastReading = { range, rise };
  paintToolScreen(range, rise);
}

function screenText() {
  const { range, rise } = lastReading;
  const r = rise == null ? null : rough(rise);
  let out = 'RANGE ROD';
  out += '\nrange    ' + (range == null ? 'open space' : '~' + rough(range) + '    ' + rangeBand(range));
  out += '\nheight   ' + (r == null ? '—' : r === 0 ? 'level' : (r > 0 ? '+' : '−') + Math.abs(r) + (r > 0 ? ' up' : ' down'));
  return out;
}

registerTool({ itemId: RANGE_ROD, onUpdate, screenText });
