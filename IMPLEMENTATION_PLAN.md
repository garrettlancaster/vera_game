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

---

## Slice 2 — "stock" & "rate" readouts  *(next, client-only)*

Turn the opaque HUD into legible quantities, still framed as practical:
- **Stock:** total blocks / total meat carried (the hotbar as a quantity).
- **Rate:** a plain-language hunger projection ("food will last a while / running
   low soon"), *not* "hunger = 6.4 / 10."
Both reuse the `rough()` magnitude style from Slice 1. No server.

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
