# IMPLEMENTATION_PLAN

Concrete, buildable slices that realize `MATH_PLAN.md` (concept → code).
This is the *build order*, not a restatement of the concepts. Each slice is
independently shippable and has an acceptance test.

**Ownership split** (from `MATH_PLAN.md` §11): the voxel world stays client-side
(vanilla JS + three.js); a new **Elixir/Phoenix** backend owns the *personalization*
(adaptivity, mastery, character AI, task selection) once we reach those slices.
Slices 1–2 are client-only and need no server. Slices 3+ introduce the Phoenix
backend. **The "an NPC needs help" channel is now in** (Slice 1): a helper asks a
small favour and hands over a tool. The broader *Social channel* — an NPC who
*reasons out loud while working* (Slice 3) — is still held per the brief; only a
minimal ask/grant line exists for now.

**Guiding principle — prefer *tools*.** A math/legibility capability is added as a
handheld **tool the player earns** (an item + a device + a readout screen + an update
that acts while it's held), acquired by *helping an NPC who needs it* — never as a
HUD or feature handed to the player. Slice 1 establishes this with the Range Rod;
future legibility surfaces (Slice 2's stock/rate, and later) follow the same shape.

---

## Slice map

| # | Slice | Owner | Status |
|---|---|---|---|
| A | Module refactor — split `game.js` into `client/` ES modules (`DEV_HANDOFF.md` §3) | client | **done** |
| 1 | **Legibility — the Range Rod** (a tool: distance + vertical scale, earned from a helper NPC) | client | **done** |
| 2 | Legibility — "stock" & "rate" readouts (carried totals; hunger projection) | client | next |
| 3 | Social channel — first NPC who *reasons while doing* (a builder) | client render + Phoenix gen | blocked: pending character copy |
| 4 | Economy — proportion wiring (yield-vs-meals; build cost *derived, not looked up*) | client + Phoenix | — |
| 5 | Adaptive engine — behavior-event stream, rung/mastery state, transitions | **Phoenix** | — |
| 6 | Challenge channel — a few hand-built goals that *require* reasoning | client + Phoenix | — |
| 7 | Upper rungs (spatial, prediction) as rewards | client + Phoenix | — |
| 8 | Concealment audit (every screen/line vs. `MATH_PLAN` §8 anti-goals) | cross-cutting | — |

The client↔server **seam** (Phoenix) is a `behavior-events-up / decisions-down`
channel: the client streams the `MATH_PLAN §5` signals (estimation efficiency,
recovery, time-to-self-correct, miscounts) and the server returns task / character
/ verbosity decisions. Nothing crossing it is a "math" signal — only a "game" signal.

---

## Slice A — module refactor   *(this session, done in 5 commits)*

**Goal.** Turn the single 1970-line `game.js` into the ES-module tree
`DEV_HANDOFF.md` §3 specifies — a *pure move*, no gameplay/behavior change —
so future slices (Slice 3's data-driven settlers, Slice 5's Phoenix seam)
have somewhere to plug in without touching a monolith. Done as five small,
independently-verified commits rather than one big one, per the session's
"small steps" instruction.

**What moved where.** Exactly `DEV_HANDOFF.md` §3's layout: `client/core/`
(rng, voxel-grid, world-gen, chunks, textures, plus a new `scene.js` — see
below), `client/physics/physics.js`, `client/player/` (player.js, arm.js,
stats.js), `client/inventory/` (inventory.js, `tools/tool-device.js`,
`tools/range-rod.js`), `client/interaction/` (raycast.js, mining.js,
placing.js), `client/entities/` (mobs.js, drops.js, `npc/npc.js`,
`npc/dialogue.js`), `client/ui/hud.js`, and `client/main.js` as the
orchestrator. `sounds.js` moved to `client/sounds.js` unchanged.
`index.html` now loads `client/main.js`; `game.js` is deleted (its history
is still in git).

**Amendments to `DEV_HANDOFF.md` discovered while implementing** (the plan
was right about *what* to split, and mostly right about *where each piece
goes* — these are the real gaps a design pass on paper couldn't see):

1. **`core/scene.js` is new.** The renderer/scene/camera/sky/sun/clouds
   bootstrap had no assigned home in the original table. Giving it one
   module (rather than folding it into `main.js`) is what lets
   `chunks.js`, `player.js`, `arm.js`, and the `entities/` modules import
   `scene`/`camera` without a circular dependency on `main.js`.
2. **`stepPhysics`/`cactusTick` live in `physics/physics.js`, not
   `player/player.js`.** `player.js` ended up holding only *data* — the
   player object, input state (`keys`/`locked`/`mouseState`), `findSpawn`,
   `createPlayer`, `syncCamera` — with no behavior functions. Physics
   needed read/write access to that data anyway (the original file already
   had `surfaceUnderFoot` forward-referencing a not-yet-declared `player`
   const via closures), so the per-frame integration functions sit in
   physics.js instead, which now also depends on `player/stats.js` for
   `takeDamage`/`respawnPlayer` and a shared `hungerState` object.
3. **The strict layering direction in `DEV_HANDOFF.md` §3 ("core → physics
   → player → interaction → entities/inventory") doesn't hold exactly.**
   In practice: `physics.js` depends on `player.js` *and* `stats.js`;
   `stats.js` depends on `inventory.js` (eating consumes a held item);
   `inventory.js` and `player/arm.js` import each other (`inventory.js`'s
   `updateHeldItem()` calls `arm.js`'s `setHeldItem()`; `arm.js` reads
   `ITEM_INFO`/`inventory`/`selIndex` from `inventory.js`). Every one of
   these circular-looking pairs is safe for the same reason the original
   file's forward references were safe: nothing reads the circular import's
   value at module-*evaluation* time, only later, from inside a function
   body, by which point every module has finished loading. `main.js` is
   still the only file that reaches into every layer for DOM event wiring.
   Treat "core/physics/voxel-grid don't import upward" as the one direction
   that's a hard rule; the rest of the original table is a reasonable
   default, not a constraint to fight when the code says otherwise.
4. **No `input.js` module.** Raw DOM listener registration (`keydown`,
   `mousemove`, `pointerlockchange`, `resize`, `contextmenu`) lives in
   `player.js`'s `initPlayerControls()` since it's pure input *state*, no
   cross-layer calls. But `mousedown`/`mouseup`/`wheel` — which immediately
   trigger mining, placing, attacking, and inventory selection — are wired
   directly in `main.js`, per its stated role as the one module allowed to
   import from every layer. Multiple independent listeners on the same DOM
   event fire in registration order, which is what makes this split safe.
5. **`quest-data.js` (the data-driven settler content model from
   `DEV_HANDOFF.md` §5) was deliberately *not* introduced yet.**
   `entities/npc/npc.js` keeps `spawnSettlers()`/`interactNPC()` as direct
   code, matching the original exactly. That generalization is Slice 3
   work (blocked on character copy, per the slice map above) — pulling it
   into a behavior-identical refactor slice would have mixed a structural
   change with a content-model change.
6. **`aabbOverlapsCell` lives in `interaction/placing.js`, not
   `interaction/mining.js`.** The original table put it in "mining"; it's
   only ever called from `doPlace` (checking you're not placing a block
   inside yourself), so it moved to where it's actually used.

**Preserving the seeded world exactly.** The world/texture generator draws
from one seeded `rnd()` sequence (`core/rng.js`) at module-evaluation time in
three places — `world-gen.js`'s `ISLANDS` array, `textures.js`'s
`texCanvases`, and `scene.js`'s cloud placement — in that order. ES modules
evaluate *all* of a file's imports before any of its own top-level code
runs, so `main.js` pins this order explicitly as its first two import
statements (`core/world-gen.js` then `core/chunks.js`, the latter pulling in
`textures.js` then `scene.js` in the right order via its own import list) —
see the long comment at the top of `client/main.js`. Every other module's
later import of the same files just reuses the already-evaluated instance,
so this only has to be gotten right once, in one place.

**Verification.** No browser is available interactively in this environment,
but Playwright + a locally `npm install`-ed copy of `three@0.160.0` (this
sandbox has no egress to the jsDelivr CDN the game normally loads three.js
from — see the CDN note in this repo's environment docs) let this session
actually load the page in headless Chromium and check it:
- `node --check` on all 24 new files — clean.
- The page loads with **zero console/page errors**, both at rest (5s) and
  while exercising input (click, WASD, mouse-move, a mine/place click) —
  this runs the *entire* per-frame call graph every frame regardless of
  pointer-lock state (most `locked`-gated functions early-return, but their
  bodies still execute and would throw on a broken import).
- A screenshot taken after the refactor is **pixel-identical** to one taken
  before it (same dune/cactus/tree layout, same debug-HUD position string) —
  direct confirmation the seeded-rnd() ordering above was preserved exactly.
  The only difference between the two screenshots is a wandering cow, which
  uses `Math.random()` (unseeded), exactly as it did before the refactor.
- **Residual gap, left for a human (or a future session) to confirm:**
  headless Chromium's `requestPointerLock()` doesn't succeed under
  Playwright automation (a standard browser restriction on programmatic
  pointer lock without a "real" user gesture), so the `locked`-gated
  code paths themselves — movement, mining/placing, mob combat, NPC
  interaction, the arm swing animation, the Range Rod's live reading —
  were verified by careful line-by-line comparison against the original
  during the move, not by an automated interactive test. Manual play
  (`node server.mjs`, click to lock the mouse) is the recommended final
  check before trusting this refactor completely.

---

## Slice 1 — the Range Rod   *(this session)*

**Goal.** Make the distance and vertical scale that *already exist* in the world
legible — but as a **tool the player earns**, not a HUD handed to them. The
capability lives in the player's hands and is *gated behind a social interaction*:
a helper NPC asks for a favour and hands it over.

**The Range Rod.** A handheld instrument (the `RANGE_ROD` item) with a live LCD
readout screen. While it is selected in the hotbar it reads the crosshair target's
range and vertical rise via a *long* raycast, magnitude-rounded: a long way across
the map reads in tens, not to the block. The number lives on the *device's screen*
(echoed in a small LCD panel) — never a "math question."

**Acquisition — the "help a stranger" pattern.** A settler NPC ("Pip") stands near
spawn and, when the player comes close, asks: *"I have shaky hands — can you measure
that ridge for me?"* Left-clicking the NPC grants the rod. A math capability becomes
an object you acquire by *assisting*, not a feature you're given. `interactNPC()`
grants it; `sayDialog()` shows the one line.

**Concealment.** Nothing appears until the rod is held; the default view is still a
pure sandbox. Values are **magnitude-rounded** (`rough()`), which is itself the
number-sense lesson — *estimation over false precision* — without ever saying "math."

**What changed**
- `game.js`: `RANGE_ROD` item + `rangeRod` icon; a *tool pattern* in the held-item
   system (`buildToolMesh` builds a device with a live screen; `updateMeasure` acts
   only while the rod is held and paints its screen via `paintToolScreen`); a
   settler-NPC section (`makeSettlerMesh`, `spawnSettlers`, `targetedNPC`,
   `interactNPC`, `updateNPCs`) + a minimal dialogue caption (`sayDialog`).
- `index.html`: `#measure` is now an LCD device screen (shown only while the rod is
   held); a `#dialogue` caption for NPC lines; the old `M` toggle is gone.
- `raycastVoxel` iteration cap raised `256 → 1024` so a far look reaches distant
   terrain. Safe for mining (its `maxDist` is 6, so it returns via the
   `tMax > maxDist` check long before the cap) — a shared-core change, flagged here.

**Acceptance**
- The rod is not in the inventory at start; talking to Pip grants it.
- Holding the rod shows a range + vertical reading on its screen; not holding it
   shows nothing. Looking at open sky shows "open space."
- `node --check game.js` passes; the page loads with no console errors.
- **Concealment test:** the readout reads as a device's display, and the tool was
   *earned* — not a math problem, not a feature switch.

**Verified this pass.** `node --check game.js` is clean; the editor reports no
diagnostics on `game.js`/`index.html`; served over `node server.mjs`, root and
`game.js` both return 200 with the edited content. Not yet done: a *visual* browser
check (device orientation, screen legibility, NPC placement) — there is no browser
here.

**Follow-up (post-Slice A): the favour had no real target and no way to close.**
User-reported gap after Slice A's refactor: Pip's line said "measure that ridge for
me," but Pip spawned at any dry patch within 15 blocks of the player's own spawn —
there was no actual ridge nearby to look at — and the grant line said "Thank you"
*immediately* on the first click, before anything had been measured, so there was
never a real ask-then-answer loop, just a tool handed over with a dialogue line that
implied one. Fixed in `client/entities/npc/npc.js` and
`client/inventory/tools/range-rod.js`:
- `spawnSettlers()` now searches a 48-block ring around Pip's candidate spot
  (`findNearbyRidge`) for a real point at least 6 blocks higher — an actual hill the
  terrain generator built — and, if found, orients Pip's idle stance to face it (an
  environmental cue, not a waypoint marker/arrow, which would read as a HUD). Verified
  against this world's real seed: for the current spawn, it finds a landmark 12 blocks
  higher, ~40 blocks off. Falls back to generic phrasing ("something far off") if no
  landmark turns up within the search radius.
- The grant line no longer says "thank you" for a favour not yet done. `range-rod.js`
  now tracks `measureState` (has the player ever gotten a reading of 15+ blocks — "a
  short way off" or farther, ruling out a trivial glance at nearby ground); `interactNPC()`
  checks it on a second interaction and, once true, has Pip react to *whatever the
  player measured*, magnitude-rounded and phrased in words, exactly as already shown on
  the rod's own screen — never validated against "the right answer," per `MATH_PLAN.md`
  §8's ban on a single correct numeric answer. A gentle one-time nudge ("aim the rod at
  something out there") covers the case where the player hasn't tried the rod yet.
- No new UI: the "answer" is the same reading already on the rod's screen, and
  "providing" it is walking back and interacting again — no typed input, no menu.

**Follow-up 2 (post-Slice A): a movement regression, plus the landmark still
wasn't legible or motivated.** Three more user reports on the same feature:

1. **Strafing right (and, intermittently, other movement) stopped working.**
   Root cause: `player.js`'s pointer-lock listener was registered as
   `window.addEventListener('pointerlockchange', ...)` — copied verbatim from
   the original `game.js`, which had the same bug. Per spec, `pointerlockchange`
   fires on `Document`, not `Window`; verified directly (a Playwright test
   listening on both `window` and `document` around a real lock/unlock cycle
   recorded 0 events on `window` and 1 on `document`), and confirmed the fix:
   with the listener moved to `document.addEventListener(...)`, `locked`
   correctly flips true and all four movement keys (W/A/S/D) produce
   symmetric, opposite-signed position deltas in a scripted test — before
   the fix, `locked` never became true at all and *no* key moved the player,
   which explains why this could read as "some keys work, some don't"
   depending on what a player happened to try first (and whatever residual
   motion carried over from a moment the browser's own internal state briefly
   agreed regardless). One-line fix in `client/player/player.js`.
2. **The landmark still wasn't clearly marked.** Facing the NPC's idle stance
   toward it (Follow-up 1) was too subtle to actually find at ~40 blocks in
   fog. `spawnSettlers()` now plants a real object there: a 5-block bare WOOD
   post (`plantMarker()`, `client/entities/npc/npc.js`), placed directly into
   the world with `setBlockRaw` + `rebuildAround` the same way mining/placing
   already do. A leafless wood column doesn't occur naturally (every tree the
   generator plants carries a leaf crown — see `core/world-gen.js`'s
   `plantTree`), so it reads at a glance as "somebody put that there" without
   a waypoint arrow, minimap ping, or any other HUD element. Verified
   directly against this world's seed: the post lands as 5 solid WOOD blocks
   immediately above the ridge's actual terrain surface, with clear air
   above it.
3. **No reason was ever given for the ask.** Pip's line was "I need to know
   how far it is" with no *why*. Rewritten to give a concrete, practical
   reason tied to `STORYLINE.md`'s premise (the valley's unlit signal towers):
   Pip staked the post because they're weighing whether that rise is close
   enough to serve as a relay point, and can't judge the distance themselves.
   The report-back line's tone now varies with the measured distance (closer
   reads as good news for a relay, farther as "good to know before I commit
   to the walk") — flavor reacting to whatever the real number was, still
   never graded as right or wrong, per the same `MATH_PLAN.md` §8 rule as
   Follow-up 1.

Verified: `node --check` on both touched files; a full headless-Chromium
pass with zero console/page errors; the pointer-lock fix isolated to one
line and confirmed via a scripted before/after position-delta test; the
marker's block placement confirmed by running `generateWorld()` directly in
Node against this world's real seed and reading back the placed blocks.

---

## Slice 2 — "stock" & "rate" readouts  *(done, client-only)*

Turn the opaque HUD into legible quantities, still framed as practical:
- **Stock:** total blocks / total meat carried (the hotbar as a quantity).
- **Rate:** a plain-language hunger projection ("food will last a while / running
   low soon"), *not* "hunger = 6.4 / 10."
Both reuse the `rough()` magnitude style from Slice 1. No server.

**Resolved which pattern (DEV_HANDOFF.md §8's Slice 2 row): a second
`ToolDevice`, not a HUD-embedded readout.** MATH_PLAN.md §9 and
IMPLEMENTATION_PLAN's own opening "guiding principle" both say a legibility
capability is earned from a settler, never handed over as a free HUD
feature — an always-on readout would contradict that, so this shipped as
the **Tally Slate**, a second tool through the exact pattern the Range Rod
established.

**What changed**
- `client/inventory/tools/tally-slate.js` (new): while held, shows *stock*
  (total blocks carried, total meat carried, both via `rough()`) and *rate*
  (a plain-language food projection — "running out fast" / "running low
  soon" / "holding steady" / "will last a good while" — computed from the
  player's current hunger level and the *current movement-based drain rate*,
  never a raw number). Registers itself with the same `tool-device.js`
  registry the Range Rod uses, with **zero changes to `tool-device.js`'s
  interface** — direct confirmation the pattern generalizes the way §4
  intended.
- `rough()` moved from `range-rod.js` to `tool-device.js` (re-exported from
  `range-rod.js` for its existing importers) — it's shared ToolDevice
  infrastructure now, not one tool's private helper.
- `stats.js`'s hunger state gained two exports (`HUNGER_MAX`, `HUNGER_DRAIN`)
  and `hungerState` gained a `.level` field (mirroring `hunger` on every
  change) — the same object-wrapper pattern already used for `.mode`, so the
  tally slate can read current hunger without a new import shape.
- `core/voxel-grid.js`: new `TALLY_SLATE` item id. `core/textures.js`: a
  `tallySlate` icon — a plain wood board with scratched tally marks,
  deliberately low-tech next to the Range Rod's glowing LCD look, since it's
  Wren's own handmade counting tool.
- **Wren** (Hearth Camp's quartermaster, per `STORYLINE.md` §3) is now a
  second settler, spawned close to the player's own spawn point (a short
  walk, not a trek, matching "Hearth Camp" being the hub). `entities/npc/
  npc.js`'s `spawnSettlers()`/`interactNPC()` generalized just enough to
  place and greet two settlers (a `SETTLER_SPECS` list) without adopting
  the full data-driven `quest-data.js` model — that's still deferred to
  Slice 3, per Slice A's log. Wren's favour has no report-back step (unlike
  Pip's): the tally slate is an ongoing readout, not a single measurement to
  bring back, so granting it *is* the whole favour. Her ask references Pip
  by name for continuity ("Pip mentioned you were handy").

**Verified:** `node --check` on every touched/new file; a full headless-
Chromium pass with zero console/page errors, including an interactive pass
(pointer lock succeeded, confirming the Follow-up 2 fix above holds here
too) exercising the entire per-frame loop with the new tool registered; a
standalone script running `generateWorld()` + the real placement logic
directly in Node confirmed both settlers place successfully for this
world's seed with sane separation (12.5 blocks apart). **Not yet done:**
an end-to-end interactive check of actually walking to Wren, receiving the
slate, and reading its screen — the settler-placement and tool-registration
logic are verified independently, but no automated test in this
environment walks the player to an NPC and confirms the granted tool's
`screenText()` output character-for-character. Worth a manual pass.

**Follow-up 3: pointer-lock still flaky, and the rod's favour was gameable.**
Two more reports after Slice 2, plus an explicit instruction to weight
`DEV_HANDOFF.md` over this file where they pull in different directions —
the third fix below is that reprioritization in code, not just words.

1. **Movement still broke intermittently after the Follow-up 2 fix.** That
   fix moved the `pointerlockchange` listener from `window` to `document`,
   which is correct per spec, but still depends on the browser actually
   dispatching the event at all — evidently not reliable enough. Replaced
   event-driven tracking with a per-frame poll: `player.js`'s new
   `syncLockState()` reads `document.pointerLockElement` directly and is
   called first thing in `main.js`'s `animate()`, every frame. At most one
   frame (~16ms) of staleness, zero dependency on any event firing.
2. **The rod's favour didn't require reading the rod.** A generic "glanced
   at anything 15+ blocks away" threshold meant a player could earn the
   favour's payoff without ever pointing the rod at the thing Pip actually
   asked about. `range-rod.js`'s `measureState` now exposes the *current
   hit position*, unconditionally; a settler's `track(n, dt)` context hook
   (new — see below) checks that position against the settler's own
   landmark every frame, and only *that* — not a generic distance — makes
   the report-back deliverable. Aiming anywhere else, however far, no
   longer counts.
3. **`quest-data.js` built for real, not deferred again.** Fixing #2 meant
   adding a third piece of bespoke per-NPC state to `npc.js` (after the
   landmark search and the report-back state machine) — the exact "another
   branch in a hand-rolled file" pattern `DEV_HANDOFF.md` §5 exists to
   prevent, and which had been deferred to "Slice 3" twice now. Built it:
   `entities/npc/quest-data.js` holds Pip's and Wren's content as ordered
   `contexts` (`grantsItem`, `nodeIds`, `lines.approach/nudge/grant`,
   optional `ready`/`track`); `entities/npc/npc.js` is now a generic
   engine (`currentContext`/`interactNPC`/`updateNPCs`) that knows nothing
   about either character. `DEV_HANDOFF.md` §5 updated to match the shape
   actually shipped (functions of the NPC instance, not plain strings —
   every real context needed to read `n.landmark`) and its "deferred to
   Slice 3" note corrected.

Verified: `node --check` on every touched file; a full headless-Chromium
pass with zero console/page errors; an interactive pass with pointer lock
succeeding; a scripted directional test showing all four WASD keys still
produce correct, symmetric position deltas after switching to the polling
approach.

---

## Slices 3+ — where Elixir/Phoenix enters

- **Slice 3 (Social channel):** a builder NPC who *reasons out loud while working*
  (distinct from Slice 1's "asks for help" helper) — *behavior and speech generated
  server-side*, rendered client-side. The math is hidden in *what the character does
  while working*, not in a screen. **Blocked** on character copy.
- **Slice 4 (Economy):** material costs must be **derivable by looking, never
  looked up** (a `3×3×2` wall is 18 blocks; a bridge of length `L` needs `L` spans).
- **Slice 5 (Adaptive engine):** the Phoenix process that holds rung/mastery state,
   ingests the client's behavior events, and drives rung transitions + the "zone of
  proximal development."
- **Slices 6–8:** Challenge goals, upper rungs, and the cross-cutting concealment
   audit against `MATH_PLAN.md §8`.

---

## Run / verify

```sh
node server.mjs                        # static server, http://127.0.0.1:8321
node --check client/**/*.js client/*.js   # syntax gate after any client/ edit (post-Slice A;
                                           # game.js no longer exists — see Slice A's log above)
```

**A headless browser is available in this environment**, contrary to what
Slice 1's log above says ("there is no browser here") — that was true when
it was written, before this session found that Playwright + Chromium are
pre-installed. Since the sandbox has no network egress to the jsDelivr CDN
`index.html` loads `three` from, point Playwright's request interception at
a locally `npm install`-ed copy of the same `three` version instead of
disabling the check; see Slice A's "Verification" section above for the
working pattern (route interception, not a permanent code change — the
shipped `index.html` still loads three.js from the CDN as designed).

Slice 1 is client-only: no Phoenix. It adds one NPC line (the ask/grant), not a
dialogue system, and changes no existing gameplay.
