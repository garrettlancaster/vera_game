import SFX from '../sounds.js';
import { AIR, WATER, inBounds, blockAt, setBlockRaw } from '../core/voxel-grid.js';
import { rebuildAround } from '../core/chunks.js';
import { player, EYE, PHEIGHT, PHALF } from '../player/player.js';
import { triggerArmSwing } from '../player/arm.js';
import { inventory, selIndex, ITEM_INFO, removeOneSelected } from '../inventory/inventory.js';

// NOTE (module-split amendment): aabbOverlapsCell moved here from what
// DEV_HANDOFF.md's table called "mining.js" — it's only ever used by doPlace
// (checking you're not placing a block inside yourself), so it belongs with
// placing, not breaking. See IMPLEMENTATION_PLAN.md's Slice A log.
function aabbOverlapsCell(bx, by, bz) {
  const p = player.pos;
  return bx + 1 > p.x - PHALF && bx < p.x + PHALF &&
         by + 1 > p.y - EYE    && by < p.y - EYE + PHEIGHT &&
         bz + 1 > p.z - PHALF && bz < p.z + PHALF;
}

export function doPlace(hit) {
  if (!hit) return false;
  const st = inventory[selIndex.i];
  if (!st || !ITEM_INFO[st.id] || ITEM_INFO[st.id].noPlace) return false;   // empty hand / non-placeable item (meat etc.)
  const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
  if (!inBounds(tx, ty, tz)) return false;
  { const cur = blockAt(tx, ty, tz); if (cur !== AIR && cur !== WATER) return false; } // solids may displace water
  if (aabbOverlapsCell(tx, ty, tz)) return false; // don't place inside yourself
  setBlockRaw(tx, ty, tz, st.id);
  rebuildAround(tx, tz);
  SFX.place(st.id);
  removeOneSelected();                          // one block out of the hand per placement
  triggerArmSwing('place');
  return true;
}
