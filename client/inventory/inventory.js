import { GRASS, DIRT, STONE, WOOD, LEAVES, SAND, MEAT, CACTUS, RANGE_ROD } from '../core/voxel-grid.js';
import { texCanvases } from '../core/textures.js';
import { setHeldItem } from '../player/arm.js';

// NOTE (module-split amendment): inventory.js <-> player/arm.js is a circular import —
// updateHeldItem() here calls setHeldItem() there, and arm.js needs ITEM_INFO/inventory/
// selIndex from here. Safe because neither module calls into the other at module-evaluation
// time, only from functions invoked later (once every module has finished loading) — the
// same forward-reference the original single file relied on via closures.

// ============================================================ survival inventory
// The hotbar IS the whole bag for now: 8 slots, stacks up to 64. You spawn with
// an empty hand; mine a block and it drops on the ground - pick it up to stack it here.
export const INV_SIZE = 8, STACK_MAX = 64;
export const ITEM_INFO = {
  [GRASS]:  { name: 'Grass', tex: 'grassSide' },
  [DIRT]:   { name: 'Dirt',  tex: 'dirt' },
  [STONE]:  { name: 'Stone', tex: 'stone' },
  [WOOD]:   { name: 'Wood',  tex: 'woodSide' },
  [LEAVES]: { name: 'Leaves',tex: 'leaves' },
  [SAND]:   { name: 'Sand',  tex: 'sand' },
    [MEAT]:   { name: 'Meat',  tex: 'meat', noPlace: true },
    [CACTUS]: { name: 'Cactus', tex: 'cactus' },
     [RANGE_ROD]: { name: 'Range Rod', tex: 'rangeRod', noPlace: true, tool: 'measure' },
};

export const inventory = new Array(INV_SIZE).fill(null);    // slot -> null | { id, count }
export const selIndex = { i: 0 };   // object wrapper so other modules see live updates

export function addItem(id, n) {                            // returns true if everything fit in the bag
  if (!ITEM_INFO[id]) return false;                  // unstackable (water etc.) - not pickable
  let left = (n === undefined ? 1 : n);
  for (let i = 0; i < INV_SIZE && left > 0; i++) {   // top up existing stacks first
    const st = inventory[i];
    if (st && st.id === id && st.count < STACK_MAX) {
      const a = Math.min(STACK_MAX - st.count, left); st.count += a; left -= a;
    }
  }
  for (let i = 0; i < INV_SIZE && left > 0; i++)     // then open slots
    if (!inventory[i]) { const a = Math.min(STACK_MAX, left); inventory[i] = { id, count: a }; left -= a; }
  renderInventory(); updateHeldItem();   // refresh held item (picked up into the selected slot?)
  return left === 0;
}

export function removeOneSelected() {                        // one block out of the held slot (placing)
  const st = inventory[selIndex.i];
  if (!st) return;
  st.count--;
  if (st.count <= 0) inventory[selIndex.i] = null;
  renderInventory(); updateHeldItem();
}
export function hasItem(id) { for (const st of inventory) if (st && st.id === id) return true; return false; }

export function updateHeldItem() { setHeldItem(inventory[selIndex.i] ? inventory[selIndex.i].id : null); }

// ---- hotbar DOM: one canvas + stack count per slot, built once and redrawn on change
const hotbarEl = document.getElementById('hotbar');
const slotEls = [];
for (let i = 0; i < INV_SIZE; i++) {
  const s = document.createElement('div'); s.className = 'slot';
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const cnt = document.createElement('span'); cnt.className = 'count';
  s.append(c, cnt);
  hotbarEl.appendChild(s);
  slotEls.push({ el: s, canvas: c, count: cnt });
}
let blankTile;      // precomputed transparent 16x16 tile to clear slot canvases with
export function renderInventory() {
  if (!blankTile) { const bc = document.createElement('canvas'); bc.width = bc.height = 16; blankTile = bc.getContext('2d').createImageData(16, 16); }
  for (let i = 0; i < INV_SIZE; i++) {
    const st = inventory[i];
    const g = slotEls[i].canvas.getContext('2d');
    g.putImageData(blankTile, 0, 0);
    if (st) {
      g.drawImage(texCanvases[ITEM_INFO[st.id].tex], 0, 0);
      slotEls[i].count.textContent = st.count > 1 ? st.count : '';
    } else slotEls[i].count.textContent = '';
  }
}

const selnameEl = document.getElementById('selname');
export function selectSlot(i) {
  selIndex.i = ((i % INV_SIZE) + INV_SIZE) % INV_SIZE;
  slotEls.forEach((s, k) => s.el.classList.toggle('selected', k === selIndex.i));
  const st = inventory[selIndex.i];
  selnameEl.textContent = st ? ITEM_INFO[st.id].name : ' ';   // nbsp keeps the layout height stable
  selnameEl.classList.remove('pop'); void selnameEl.offsetWidth; selnameEl.classList.add('pop');
  renderInventory(); updateHeldItem();
}
