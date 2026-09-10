import { RANGE_ROD, TALLY_SLATE } from '../../core/voxel-grid.js';
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
//   lines.approach(n)  spoken once, on proximity, before this context is completed
//   lines.nudge(n)     spoken once per context if the player interacts before ready(n)
//   lines.grant(n)     spoken when the context actually completes (on interact, once ready)
//   nodeIds       SKILL_HIERARCHY.md node ids this context teaches/exercises

const MARKER_SIGHT_RADIUS = 10;   // how close a rod reading's hit point must land to the
                                   // marker to count as "looked at the marker," not just
                                   // "looked at the general area" — generous because the
                                   // post itself is a single block wide at 40+ blocks' range

function pipReportBackReady(n) {
  return n.landmark ? n.markerSighted : measureState.everMeasuredFar;
}
function pipTrackMarkerSight(n) {
  if (!n.landmark || n.markerSighted) return;
  if (measureState.hitX == null) return;
  const hitDist = Math.hypot(measureState.hitX - n.landmark.x, measureState.hitZ - n.landmark.z);
  if (hitDist <= MARKER_SIGHT_RADIUS) { n.markerSighted = true; n.sightedRange = measureState.range; }
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
];
