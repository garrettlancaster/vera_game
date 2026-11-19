// Drift check per DEV_HANDOFF.md §9: every node id cited in quest-data.js must exist in
// SKILL_HIERARCHY.md §3's tables, and context ids must be unique and `<settlerId>.<slug>`.
// Text-parses both files (quest-data.js imports browser-only modules, so it can't be
// imported under Node). Run: node scripts/check_traceability.mjs
import { readFile } from 'node:fs/promises';
const root = new URL('..', import.meta.url);
const md = await readFile(new URL('SKILL_HIERARCHY.md', root), 'utf8');
const js = await readFile(new URL('client/entities/npc/quest-data.js', root), 'utf8');

const known = new Set([...md.matchAll(/^\|\s*`([a-z]+(?:\.[a-z0-9-]+)+)`\s*\|/gm)].map(m => m[1]));
const fail = [];
let cited = 0, settler = null;
const ctxIds = new Set();
for (const line of js.split('\n')) {
  const code = line.replace(/\/\/.*$/, '');
  const s = code.match(/^\s*id:\s*'([a-z]+)',\s*displayName/);
  if (s) settler = s[1];
  const c = code.match(/^\s*id:\s*'([a-z]+\.[a-z0-9.-]+)'/);
  if (c) {
    if (ctxIds.has(c[1])) fail.push(`duplicate context id ${c[1]}`);
    if (!c[1].startsWith(settler + '.')) fail.push(`context ${c[1]} is not under settler ${settler}`);
    ctxIds.add(c[1]);
  }
  const n = code.match(/nodeIds:\s*\[([^\]]*)\]/);
  if (n) for (const m of n[1].matchAll(/'([^']+)'/g)) { cited++; if (!known.has(m[1])) fail.push(`unknown node id ${m[1]}`); }
}
for (const m of js.matchAll(/ids:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) if (!ctxIds.has(q[1])) fail.push(`trigger references unknown context ${q[1]}`);
if (!known.size || !cited) fail.push('parsed nothing — the file formats changed; fix this script');
console.log(`${known.size} skill nodes, ${ctxIds.size} contexts, ${cited} node citations`);
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('traceability OK');
