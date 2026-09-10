// ============================================================ dialogue caption
// A single friendly line from a helper NPC (e.g. asking for help). Deliberately minimal —
// this is the "an NPC needs help" channel, not a dialogue system.
const dialogEl = document.getElementById('dialogue');
let dialogT = 0;
export function sayDialog(name, text, ms = 4500) {
  dialogEl.textContent = name + ': ' + text;
  dialogEl.classList.add('show');
  dialogT = ms;
}
export function updateDialog(dt) {
  if (dialogT <= 0) return;
  dialogT -= dt;
  if (dialogT <= 0) dialogEl.classList.remove('show');
}
