import * as THREE from 'three';
import { rnd, hash2 } from './rng.js';

// ============================================================ procedural pixel textures (16x16 canvases)
export function makeTex(pxFn) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  const img = g.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const [r, gr, b, a] = pxFn(x, y);
    const i = (y * 16 + x) * 4;
    img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = a === undefined ? 255 : a;   // pxFn may return an alpha (cut-out textures)
  }
  g.putImageData(img, 0, 0);
  return c;
}
export const vary = (base, amt) => base.map(v => Math.max(0, Math.min(255, Math.round(v + (rnd() * 2 - 1) * amt))));

export function woodTopPx(x, y) {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return vary(d < 1 ? [86, 66, 38] : (Math.floor(d) % 2 === 0 ? [152, 124, 80] : [116, 90, 54]), 7);
}

export const texCanvases = {
  grassTop:  makeTex(() => vary([108, 173, 72], 15)),
  dirt:      makeTex(() => vary([134, 99, 70], 13)),
  grassSide: makeTex((x, y) => { const edge = 3 + (rnd() < 0.5 ? 0 : 1); return y < edge || (y === edge && rnd() < 0.6) ? vary([98, 162, 64], 15) : vary([134, 99, 70], 13); }),
  stone:     makeTex(() => { const base = rnd() < 0.07 ? [104, 104, 108] : [126, 126, 130]; return vary(base, 10); }),
  woodSide:  makeTex((x) => { const col = Math.sin(x * 3.1 + (x % 3) * 1.7) * 0.5 + 0.5; return vary([84 + col * 36, 62 + col * 26, 34 + col * 14], 8); }),
  woodTop:   makeTex(woodTopPx),
  leaves:    makeTex(() => { const base = rnd() < 0.1 ? [38, 78, 30] : [52, 106, 44]; return vary(base, 18); }),
  tallgrass: makeTex((x, y) => {   // MC-style blade cluster on a transparent background (alphaTest cut-out)
    if (hash2(x * 13.7, 9.2) < 0.3) return [0, 0, 0, 0];           // gaps between blades
    const hgt = 5 + Math.floor(hash2(x * 7.31, 3.7) * 10);          // blade tip height (6..15 rows from the bottom)
    if (y < 15 - hgt) return [0, 0, 0, 0];                          // above the tips: see-through
    const t = (15 - y) / hgt;                                       // 0 at the base -> 1 at the tip
    const j = hash2(x * 3.17, y * 5.9);                             // per-pixel grain
    return [Math.round(46 + t * 36 + j * 18), Math.round(110 + t * 72 + j * 24), Math.round(36 + t * 24 + j * 12)];
  }),
  sand:      makeTex(() => vary([221, 208, 162], 11)),
  water:     makeTex(() => vary([52, 108, 196], 14)),
  meat:      makeTex((x, y) => { const m = (Math.sin(x * 2.3 + y * 1.7) > 0.5); return vary(m ? [196, 74, 58] : [214, 120, 96], 12); }),
  cactus:    makeTex((x, y) => { if (rnd() < 0.07) return vary([216, 234, 200], 8);    // pale spine fleck
                     const band = (Math.sin(x * Math.PI / 2.5) > 0.15);              // vertical ribbing like a real cactus
                     return vary(band ? [86, 164, 70] : [52, 124, 46], 9); }),
   // Range Rod: a handheld instrument — a dark body with a glowing green readout panel (the hotbar icon)
  rangeRod:  makeTex((x, y) => {
    const screen = y >= 3 && y <= 6 && x >= 5 && x <= 10;
    const head   = y >= 2 && y <= 9 && x >= 3 && x <= 12;
    const grip   = y >= 10 && y <= 15 && x >= 6 && x <= 9;
    if (screen) return vary([40, 130, 80], 10);    // glowing LCD readout
    if (head)   return vary([52, 58, 70], 6);       // dark instrument body
    if (grip)   return vary([44, 48, 58], 5);       // handle
    return [0, 0, 0, 0];                            // transparent
  }),
   // Tally Slate: a plain wooden board with a few scratched tally marks — deliberately
   // low-tech (no screen) next to the Range Rod's electronic look, since it's Wren's own
   // handmade counting tool, not an instrument (the hotbar icon)
  tallySlate: makeTex((x, y) => {
    const board = y >= 1 && y <= 14 && x >= 2 && x <= 13;
    if (!board) return [0, 0, 0, 0];                // transparent
    const tally = y >= 6 && y <= 9 && ((x - 4) % 3 === 0) && x >= 4 && x <= 11;
    if (tally) return vary([70, 52, 34], 6);         // scratched tally marks
    return vary([176, 140, 92], 10);                 // pale wood board
  }),
};

export function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  // Our UV tables assume v=0 at the top of the image, so disable three's default vertical flip.
  t.flipY = false;
  // Mipmapping kills the distance shimmering; nearest-mip sampling keeps pixels crisp.
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapNearestFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ============================================================ materials (one per texture, built once)
export const materials = {};
for (const [name, canvas] of Object.entries(texCanvases)) {
  const opts = { map: toTexture(canvas), vertexColors: true };
  if (name === 'water') { opts.transparent = true; opts.opacity = 0.62; opts.side = THREE.DoubleSide; }   // see-through blue water; DoubleSide so the surface underside is visible when submerged
  if (name === 'tallgrass') { opts.side = THREE.DoubleSide; opts.alphaTest = 0.5; }   // cross quads seen from either side; cut-out, no sorting needed
  materials[name] = new THREE.MeshBasicMaterial(opts);
}
