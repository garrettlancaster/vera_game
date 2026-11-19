import { RANGE_ROD, TALLY_SLATE, STONE, blockAt } from '../../core/voxel-grid.js';
import { inventory } from '../../inventory/inventory.js';
import { sayDialog } from './dialogue.js';
import { buildQuarrySite, setSiteBlock, roomCells } from './sites.js';
import { player } from '../../player/player.js';
import { rangeBand, rough, measureState } from '../../inventory/tools/range-rod.js';

// ============================================================ settler / quest data
// Per DEV_HANDOFF.md §5: settler content as data, not code — adding a context should be
// an edit to this file, not to npc.js's engine. Each settler's `contexts` are delivered in
// order; npc.js's generic evaluator (currentContext/interactNPC/updateNPCs) is the only
// code that reads this shape. nodeIds cite SKILL_HIERARCHY.md — the traceability check
// DEV_HANDOFF.md §9 describes (docs and data can't silently diverge) isn't built yet, but
// this is the data it would run against.
//
// Context shape:
//   id            stable slug, `<settlerId>.<slug>` per DEV_HANDOFF.md §9 naming rules
//   trigger       { type: 'contexts-done', ids: [...] } if this context can't start until
//                 others finish, otherwise omitted (available as soon as reached in order)
//   ready(n)      optional — must return true before `lines.grant` can fire; omit for a
//                 context that's ready the moment it's reached (e.g. a plain grant-on-ask)
//   track(n, dt)  optional — runs every frame regardless of proximity, for state that
//                 accrues in the background (e.g. "has the rod been pointed at the marker")
//   grantsItem    optional — an ITEM_INFO id handed over the moment this context completes
//   grantCount    optional — how many (materials for a job); omit for a one-off tool
//   autoComplete  optional — completes by itself once approached and ready(n), no click
//                 needed: a demonstration the player only has to witness
//   lines.approach(n)  spoken once, on proximity, before this context is completed
//   lines.nudge(n)     spoken once per context if the player interacts before ready(n)
//   lines.grant(n)     spoken when the context actually completes (on interact, once ready)
//   nodeIds       SKILL_HIERARCHY.md node ids this context teaches/exercises

// How close a rod reading's hit point must land to the marker to count as "looked at the
// marker," not just "looked at the general area." Scales with how far away the marker is
// from where the player stands: a fixed 10-block radius (the original value) let a glance
// at the near slope of the hill count as sighting a post twice as far off — and Pip then
// echoed that wrong, shorter distance back as if it were the post's.
function markerSightRadius(n) {
  const d = Math.hypot(player.pos.x - n.landmark.x, player.pos.z - n.landmark.z);
  return Math.max(3, Math.min(10, d * 0.15));
}

function pipReportBackReady(n) {
  return n.landmark ? n.markerSighted : measureState.everMeasuredFar;
}
function pipTrackMarkerSight(n) {
  if (!n.landmark || n.markerSighted) return;
  if (measureState.hitX == null) return;
  const hitDist = Math.hypot(measureState.hitX - n.landmark.x, measureState.hitZ - n.landmark.z);
  if (hitDist <= markerSightRadius(n)) { n.markerSighted = true; n.sightedRange = measureState.range; }
}
function pipReportBackLine(n) {
  // Whatever the player actually measured — echoed back, not graded. Per MATH_PLAN.md §8:
  // no single correct numeric answer, no "wrong" reading. The tone only colors by
  // magnitude (closer reads as good news for a relay point); it never tells the player
  // their reading was right or wrong.
  const range = n.landmark ? n.sightedRange : measureState.farRange;
  const band = rangeBand(range);
  const r = rough(range);
  const close = band === 'next to you' || band === 'a short way off' || band === 'a long way';
  return close
    ? `So it's about ${r}, ${band} — well within reach. That'll make a fine relay point. Thank you.`
    : `About ${r}, ${band} — further than I'd hoped, but better to know now than halfway there. Thank you.`;
}

// ---- Bram (STORYLINE.md §5.3). His site (n.site) is built by sites.js's buildQuarrySite.
// Context 1 is the Environmental channel: he raises a wall a stone at a time and talks to
// himself in rows — never a raw tally, and never a word for the operation. He only works
// while someone's close enough to watch, so the demonstration can't finish unseen.
const BRAM_STONE_BEAT = 0.9;      // seconds per stone — a row takes about as long as its line stays up
const BRAM_WATCH_DIST = 12;
const BRAM_ROW_LINES = [
  "That's the first row. Five.",
  "Second row — five, and five again. Ten. Same row, laid twice.",
  "Third. Fifteen up. I've stopped counting stones — I'm only counting rows now.",
];
function bramTrackWall(n, dt) {
  const w = n.site.wall;
  if (n.wallLaid == null) { n.wallLaid = 0; n.wallT = 0; }
  if (!n.spokenApproachFor.has('bram.stacking-a-wall')) return;      // not before he's said hello
  if (n.wallLaid >= w.cells.length || n.playerDist > BRAM_WATCH_DIST) return;
  n.wallT += dt;
  if (n.wallT < BRAM_STONE_BEAT) return;
  n.wallT = 0;
  const c = w.cells[n.wallLaid++];
  setSiteBlock(c.x, c.y, c.z, STONE);
  const rowsDone = n.wallLaid / w.perRow;
  if (Number.isInteger(rowsDone) && rowsDone < w.rows) sayDialog(n.name, BRAM_ROW_LINES[rowsDone - 1]);
}
const bramWallDone = (n) => n.wallLaid >= n.site.wall.cells.length;

// Context 2 is the Challenge channel: the sunken store-room is real and walkable, so how
// much stone it wants is something to pace out or eyeball, never something Bram states.
// He hands over a heap that is deliberately not the exact amount.
const BRAM_FLOOR_HEAP = 30;
const bramFloorLaid = (n) => roomCells(n.site.room).every(c => blockAt(c.x, c.y, c.z) === STONE);
function bramFloorLaidLine(n) {
  // Echoed, not graded (MATH_PLAN.md §8): whatever is left over is just a fact about the
  // pile. The rows remark ties the floor back to the wall without stating a total.
  const { w, d } = n.site.room;
  let left = 0;
  for (const st of inventory) if (st && st.id === STONE) left += st.count;
  const tail = left > 0
    ? "And stone left over for the pile — better that than a walk back for more."
    : "And not a stone to spare.";
  return `That's a floor — not a gap in it. ${w} to a row, ${d} rows: it's the wall again, lying down. ${tail}`;
}

export const SETTLERS = [
  {
    id: 'pip', displayName: 'Pip',
    spawn: { radius: 15, findLandmark: true, minSep: 0 },
    contexts: [
      {
        id: 'pip.range-rod',
        grantsItem: RANGE_ROD,
        nodeIds: ['len.select-tool', 'len.estimate'],
        lines: {
          approach: (n) => n.landmark
            ? "I have shaky hands — see the post I staked on that rise? I'm hoping it's close enough to carry a signal fire, but I can't judge the distance myself anymore."
            : "I have shaky hands — I need to know how far off things are before I trust a route, and my eyes aren't what they used to be.",
          grant: (n) => n.landmark
            ? "Take the rod — line it up on the post I staked and see what you get. If it's close enough, that's our next relay point."
            : "Take the rod and get a feel for the distances out here — I won't commit to a walk until I know what I'm in for.",
        },
      },
      {
        id: 'pip.report-back',
        trigger: { type: 'contexts-done', ids: ['pip.range-rod'] },
        ready: pipReportBackReady,
        track: pipTrackMarkerSight,
        nodeIds: ['len.estimate'],   // same node, a new context — the mastery-transfer test MATH_PLAN.md §5 describes
        lines: {
          nudge: (n) => n.landmark
            ? "Still no word? Line the rod up on the post I staked, not just anywhere — its screen will show you."
            : "Still no word? Aim the rod at something out there — its screen will show you.",
          grant: pipReportBackLine,
        },
      },
    ],
  },
  {
    // Hearth Camp's quartermaster — close to spawn, per STORYLINE.md §3. References Pip by
    // name for continuity even though the two never actually talk; the player meets Pip
    // first (Pip's spawn ring is searched first), so this reads as "word travels fast in a
    // small camp," not a broken reference.
    id: 'wren', displayName: 'Wren',
    spawn: { radius: 8, findLandmark: false, minSep: 10 },
    contexts: [
      {
        id: 'wren.tally-slate',
        grantsItem: TALLY_SLATE,
        // Strand A/B (STORYLINE.md §5.1's "Is that enough?" / re-bundling stock); the
        // slate's *rate* projection has no SKILL_HIERARCHY.md node of its own — it's the
        // cross-cutting estimation-quality axis (SKILL_HIERARCHY.md §4), not a distinct
        // standard, so it isn't cited here as if it were one.
        nodeIds: ['count.skip-5-10-100', 'place.compose-hundreds'],
        lines: {
          approach: () => "Pip mentioned you were handy — could you help me keep an eye on the stores? My own count keeps slipping.",
          grant: () => "Here — take this tally slate. Carry it and it'll keep a running count of what's on you, and how your food's holding out. Saves me asking every time you pass through.",
        },
      },
    ],
  },
  {
    // The Quarry's mason — further out than Pip, so the player meets him third.
    id: 'bram', displayName: 'Bram',
    spawn: { radius: 26, findLandmark: false, minSep: 10, site: buildQuarrySite },
    contexts: [
      {
        id: 'bram.stacking-a-wall',
        autoComplete: true,
        ready: bramWallDone,
        track: bramTrackWall,
        nodeIds: ['mult.equal-groups-total', 'mult.repeated-groups'],
        lines: {
          approach: () => "Mind your feet — wall's going up. Five stones to a row, every row. Stand and watch if you like; I talk while I work.",
          grant: () => "Fourth row. Twenty stones in that wall, and I never once counted past five. That's how you get a wall up before dark.",
        },
      },
      {
        id: 'bram.floor-a-room',
        trigger: { type: 'contexts-done', ids: ['bram.stacking-a-wall'] },
        grantsItem: STONE,
        grantCount: BRAM_FLOOR_HEAP,
        nodeIds: ['area.tiling'],
        lines: {
          approach: () => "Store-room's next — that sunk patch behind me. It wants stone laid edge to edge, and my back's had enough for one day. Would you?",
          grant: () => "Here's a heap off the pile. Walk the patch before you start, if you like — I always want to know what a floor will swallow before I lay the first stone.",
        },
      },
      {
        id: 'bram.floor-laid',
        trigger: { type: 'contexts-done', ids: ['bram.floor-a-room'] },
        ready: bramFloorLaid,
        nodeIds: ['area.tiling', 'area.as-multiplication'],
        lines: {
          nudge: () => "There's still earth showing in that floor. Stone, edge to edge — come and find me when it's covered.",
          grant: bramFloorLaidLine,
        },
      },
    ],
  },
];
