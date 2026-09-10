import { player } from '../player/player.js';

// ============================================================ debug HUD (top-left)
const debugEl = document.getElementById('debug');
let fpsSmooth = 60, frameMs = 16.7, hudTimer = 0;
const COMPASS = ['N','NE','E','SE','S','SW','W','NW'];
export function updateDebug(dt) {
  const inst = dt > 0 ? 1 / dt : 60;
  fpsSmooth += (Math.min(inst, 240) - fpsSmooth) * 0.1;      // light smoothing
  frameMs += (dt * 1000 - frameMs) * 0.1;
  hudTimer += dt;
  if (hudTimer < 0.1) return;                                  // refresh ~10x/s
  hudTimer = 0;
  const p = player.pos;
  const bearing = ((Math.atan2(-Math.sin(player.yaw), Math.cos(player.yaw)) * 180 / Math.PI + 360) % 360);
  const dir = COMPASS[Math.round(bearing / 45) % 8];
  const pitchDeg = player.pitch * 180 / Math.PI;
  debugEl.textContent =
    `fps: ${fpsSmooth.toFixed(0)}
` +
    `frame: ${frameMs.toFixed(2)} ms
` +
    `pos: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}
` +
    `dir: ${dir} ${bearing.toFixed(0)}°  pitch ${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(0)}°`;
}
