import * as THREE from 'three';
import { rnd } from './rng.js';
import { W, D, H } from './voxel-grid.js';

// ============================================================ renderer & scene
// NOTE (module-split amendment, see IMPLEMENTATION_PLAN.md Slice A): the original
// game.js built the renderer/scene/camera/sky/sun/clouds inline as one long section
// of main-flow code. DEV_HANDOFF.md's module table didn't call out a home for that
// bootstrap; this file is it, so chunks.js/player.js/entities can import `scene` and
// `camera` without a circular dependency on main.js. Nothing here changes behavior —
// it's the same construction code, same relative order (renderer, scene, fog, sky,
// sun, clouds, camera), just given a name.
export const renderer = (() => {
  // No MSAA (nearest-filtered pixel textures don't benefit from it) and a capped
  // pixel ratio so high-DPI screens stop rendering up to 4x the CSS-resolution pixels.
  const r = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  r.setSize(window.innerWidth, window.innerHeight);
  document.body.prepend(r.domElement);
  return r;
})();

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9fb, 48, 120);

// gradient sky dome (fog-exempt so it stays crisp)
export let skyDome;
{
  // 2400 (was 380): the map is much bigger now and fog-exempt clouds can sit far from the camera - the dome must stay behind them all but inside the camera's far plane (2500)
  const g = new THREE.SphereGeometry(2400, 24, 14);
  const posAttr = g.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const top = new THREE.Color(0x3f8fe0), horizon = new THREE.Color(0xcfe9fb);
  for (let i = 0; i < posAttr.count; i++) {
    const hNorm = posAttr.getY(i) / 2500;                 // -1 .. 1
    // stay exactly at the horizon color near eye level so it blends seamlessly with the fog band
    const t = Math.max(0, Math.min(1, (hNorm + 0.12) / 0.95));
    const f = t * t;
    const c = horizon.clone().lerp(top, f);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  skyDome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyDome.renderOrder = -1;
  scene.add(skyDome);
}

export let sun;
// square sun with layered square glow
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,242,178,0.30)'; g.fillRect(6, 6, 116, 116);   // outer glow
  g.fillStyle = 'rgba(255,247,200,0.90)'; g.fillRect(24, 24, 80, 80);   // inner glow
  g.fillStyle = 'rgb(255,253,240)';      g.fillRect(36, 36, 56, 56);   // square core
  const t = new THREE.CanvasTexture(c);
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  sun.scale.setScalar(260 * 0.65);   // 35% smaller
  scene.add(sun);
}

// clouds — soft flat box clusters drifting on the x axis. Placed as a jittered GRID across the
// whole map (the map is now 2.5x bigger than these clouds were designed for), so there are always
// some overhead no matter where you spawn or stand, and they drift/wrap over the full width.
export const cloudGroup = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }); // crisp even in the distance (MC-style)
  const CCOLS = Math.max(8, Math.round(W / 90)), CROWS = Math.max(5, Math.round(D / 136)); // cell size shrunk by ~sqrt(2) (was W/128, D/192) -> ~2x clouds for a denser sky
  for (let j = 0; j < CROWS; j++) for (let i = 0; i < CCOLS; i++) {
    const cl = new THREE.Group();
    const nPuffs = 3 + Math.floor(rnd() * 3);
    for (let p = 0; p < nPuffs; p++) {
      const wBox = 7 + rnd() * 9, dBox = 5 + rnd() * 6, hBox = 1.4 + rnd() * 1.2;
      const puff = new THREE.Mesh(new THREE.BoxGeometry(wBox, hBox, dBox), mat);
      puff.position.set((rnd() - 0.5) * 9, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 6);
      cl.add(puff);
    }
    cl.position.set((i + 0.15 + rnd() * 0.7) * W / CCOLS, H + 9 + rnd() * 7, (j + 0.15 + rnd() * 0.7) * D / CROWS);
    cloudGroup.add(cl);
  }
  scene.add(cloudGroup);
}

// ============================================================ camera
export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2500);
camera.rotation.order = 'YXZ';
scene.add(camera); // required so the camera's children (the arm) get rendered
