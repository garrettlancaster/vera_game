# DEV_HANDOFF — implementation contract

This document turns `SKILL_HIERARCHY.md` (what to teach) and `STORYLINE.md`
(the world it lives in) into a precise, modular build plan. It is written so
a **smaller model, with no other context, can implement one slice at a time
without guessing** — every section either states an exact interface or names
which document to re-read for the reasoning behind it.

**Reading order for an implementer:** `PLAN.md` → `MATH_PLAN.md` →
`SKILL_HIERARCHY.md` → `STORYLINE.md` → this document →
`IMPLEMENTATION_PLAN.md` (the slice log — update it, don't replace it).

**Non-negotiable rules, restated because they're the easiest thing to
forget mid-implementation:**
1. No screen, popup, or HUD element may ever say "correct," "score," a
   percentage, a grade level, or a standard code, to the player. Ever.
2. No task's only success path is a typed/selected numeric answer. Every
   task is an in-world action (build it, measure it, hand over the right
   pile) that happens to require the reasoning.
3. A skill is taught by **being demonstrated or required**, never by a
   character explaining a rule. If you're about to write dialogue that
   states a math fact ("a fraction is..."), stop — find the `SKILL_HIERARCHY`
   row and write what the character *does* instead.
4. Every new NPC line or task must cite a `SKILL_HIERARCHY.md` node id in
   its commit message or code comment. If it doesn't map to a row in that
   table, it doesn't ship (`STORYLINE.md §7`).

---

## 1. Scope

**In scope (this handoff):** the client module refactor (§3), the tool and
quest data patterns (§4–5), the Phoenix backend skeleton and its data
contracts (§6–7), and the task breakdown (§8) through
`IMPLEMENTATION_PLAN.md` Slice 5 (the adaptive engine coming online).

**Descoped, by design, not oversight:**
- 3.MD.1–2 (time-interval word problems in minutes; liquid volume/mass in
  g/kg/L) — noted in `SKILL_HIERARCHY §6`. They extend Strand H and Strand D
  respectively and can be added as new nodes + one new Corwin/Pip context
  later; nothing in this architecture blocks that.
- Slices 6–8 from `IMPLEMENTATION_PLAN.md` (Challenge-channel goals beyond
  the Overlook, upper-rung rewards, the concealment audit) are architecturally
  supported by everything below but not detailed task-by-task here — extend
  §8's table using the same pattern once Slice 5 is stable.
- Accounts/auth: the game needs a **stable per-player identity** to persist
  mastery across sessions, not a full user system. §6.1 specifies the
  minimal shape; do not build login/registration/roles beyond that unless
  separately asked.

---

## 2. Current-state map

The client is one file today: `game.js` (vanilla JS, loaded as
`<script type="module">` — see `index.html:148` — with `three` resolved via
the import map at `index.html:109-110`). No build step exists and **none
should be introduced**; native ES module `import`/`export` across multiple
files is a drop-in replacement for the current single file.

Existing symbol groups in `game.js` (line numbers as of this handoff; expect
drift — re-grep before relying on exact numbers):

| Group | Representative symbols | Lines (approx) |
|---|---|---|
| RNG / noise | `rnd`, `hash2`, `vnoise`, `hash3`, `vnoise3` | 36–69 |
| Voxel grid | `blocks`, `idx`, `inBounds`, `blockAt`, `setBlockRaw`, `solidForPhysics`, `heightAt`, `topSolidY` | 70–141 |
| World gen | `generateWorld`, `plantTree`, `plantCactus`, `desertAt`, `forestAt`, `seaDepthAt`, `riverZ`, `riverHalfW`, `ISLANDS` | 109–270 |
| Textures | `makeTex`, `woodTopPx`, `toTexture` | 271–337 |
| Chunking / render | `FACES`, `materialKey`, `rebuildWater`, `buildChunk`, `rebuildAllChunks`, `rebuildAround`, `ensureNearChunks`, `cullRegions` | 338–614 |
| Physics | `collides`, `collidesAt`, `moveAxis`, `surfaceUnderFoot` | 25–34, 649–693 |
| Player / camera | `syncCamera`, `findSpawn` | 618–693 |
| Held-item arm & tools | `addArmBox`, `disposeHeld`, `setHeldItem`, `buildToolMesh`, `updateArm`, `triggerArmSwing` | 694–823 |
| Raycast / mining / placing | `raycastVoxel`, `doBreak`, `doPlace`, `aimHit`, `updateMining`, `BREAK_TIME`, `makeCrackTexture` | 825–997 |
| Inventory | `ITEM_INFO`, `inventory`, `addItem`, `removeOneSelected`, `hasItem`, `renderInventory`, `selectSlot`, `updateHeldItem` | 998–1075 |
| Player stats HUD | `renderHearts`, `drawHeart`, `renderOxygen`, `drawBubble`, `updateOxygen`, `drawMeat`, `takeDamage`, `respawnPlayer`, `die` | 1076–1256 |
| Drops | `dropMats`, `spawnDrop`, `removeDrop`, `updateDrops` | 1257–1308 |
| Mobs | `MOB_TYPES`, `makeMobMesh`, `addMob`, `spawnMobs`, `killMob`, `updateMobs`, `targetedMob`, `attackMob` | 1317–1552 |
| Range Rod tool logic | `rough`, `rangeBand`, `paintToolScreen`, `updateMeasure` | ~1837–1900 (grep `rough(` to locate precisely) |
| Dialogue | `sayDialog`, `updateDialog` | 1553–1562 |
| Settler NPCs | `NPCS`, `makeSettlerMesh`, `addSettler`, `spawnSettlers`, `targetedNPC`, `interactNPC`, `updateNPCs` | 1564–1647 |
| Input wiring & main loop | keydown/mouse handlers, the animation loop | 1650–end |

`sounds.js` is already a separate module and is the pattern to follow: a
self-contained file with a small exported surface, imported where needed. No
change required to it in this handoff.

---

## 3. Client module plan

**Rule for this refactor: it is a pure move, not a rewrite.** Slice A (§8)
must not change any observable behavior — same physics, same visuals, same
NPC lines. Verification is `node --check` on every new file plus a manual
play-through diff against current behavior. Do not "improve" logic while
moving it; file a follow-up instead.

Target layout (all under a new `client/` directory; `sounds.js` moves in
unchanged):

```
client/
  main.js                    — imports everything, owns the animation loop
  core/
    rng.js                   — rnd, hash2, vnoise, hash3, vnoise3
    voxel-grid.js             — blocks, idx, inBounds, blockAt, setBlockRaw,
                                setBlockRawIfAir, solidForPhysics, heightAt,
                                topSolidY, isSandy
    world-gen.js               — generateWorld, plantTree, plantCactus,
                                desertAt, forestAt, seaDepthAt, riverZ,
                                riverHalfW, ISLANDS
    textures.js                — makeTex, woodTopPx, toTexture
    chunks.js                  — FACES, materialKey, neighborIdForFaces,
                                rebuildWater, buildChunk, rebuildAllChunks,
                                rebuildAround, ensureNearChunks, cullRegions,
                                CULL_DIST
  physics/
    physics.js                — collides, collidesAt, moveAxis,
                                surfaceUnderFoot
  player/
    player.js                  — player state object, syncCamera, findSpawn
    arm.js                      — addArmBox, disposeHeld, setHeldItem,
                                buildToolMesh, updateArm, triggerArmSwing
    stats.js                     — hearts/hunger/oxygen rendering,
                                takeDamage, respawnPlayer, die
  interaction/
    raycast.js                   — raycastVoxel, aimHit
    mining.js                     — doBreak, updateMining, BREAK_TIME,
                                makeCrackTexture, hideCracks,
                                aabbOverlapsCell
    placing.js                    — doPlace
  inventory/
    inventory.js                  — ITEM_INFO, inventory, addItem,
                                removeOneSelected, hasItem, renderInventory,
                                selectSlot, updateHeldItem
    tools/
      tool-device.js               — NEW: the generalized ToolDevice
                                interface (§4)
      range-rod.js                  — rough, rangeBand, paintToolScreen,
                                updateMeasure, registered as a ToolDevice
  entities/
    mobs.js                       — MOB_TYPES, makeMobMesh, addMob,
                                spawnMobs, killMob, mobBlocked, updateMobs,
                                targetedMob, attackMob
    drops.js                       — dropMats, spawnDrop, removeDrop,
                                updateDrops
    npc/
      npc.js                        — NPCS, makeSettlerMesh, addSettler,
                                targetedNPC, interactNPC, updateNPCs
      dialogue.js                    — sayDialog, updateDialog
      quest-data.js                   — NEW: data-driven settler/quest
                                content (§5), replaces the hardcoded
                                `spawnSettlers()` body
  telemetry/
    behavior-events.js                — NEW: client-side event capture (§7.2)
  net/
    phoenix-socket.js                  — NEW: thin wrapper around the
                                Phoenix JS client (§7.2)
  sounds.js                            — moved as-is
```

**Module contract rules (apply to every file above):**
- Export only what other modules need; keep module-local state
  (`let`/`const` not exported) truly local — this is the actual "separation
  of concerns" the brief asks for, not just file boundaries.
- A module in `core/`, `physics/`, or `interaction/` must never import from
  `entities/`, `inventory/`, or `net/` — dependencies flow one direction:
  `core → physics → player → interaction → entities/inventory → telemetry/net`.
  `main.js` is the only file allowed to import from every layer.
- `entities/npc/quest-data.js` and `inventory/tools/range-rod.js` are the
  **only** files that should ever need to change when `STORYLINE.md` grows a
  new settler context or `SKILL_HIERARCHY.md` grows a new node's in-world
  hook. If implementing a new node requires touching `chunks.js` or
  `physics.js`, stop and reconsider the design — that's a sign the feature
  isn't using the existing tool/quest patterns.

**Amendment, post-Slice A (read this before trusting the layout above
literally):** implementing this plan surfaced six real gaps/corrections —
a `core/scene.js` module this table didn't allocate; `stepPhysics`/
`cactusTick` living in `physics/physics.js` rather than `player/player.js`;
the strict layering direction above not holding exactly (`physics.js` →
`stats.js` → `inventory.js`, and an `inventory.js` ↔ `player/arm.js`
circular import, both safe and both explained); no separate `input.js`
(raw DOM listeners split between `player.js` and `main.js` by whether they
touch other layers); `quest-data.js` deliberately deferred to Slice 3;
`aabbOverlapsCell` filed under `placing.js` not `mining.js`. Full reasoning
for each is in `IMPLEMENTATION_PLAN.md`'s Slice A log — read it alongside
this table, not instead of it. The takeaway for whoever extends this next:
treat "core/physics/voxel-grid never import upward" as the one hard rule,
and expect the rest to bend to what the code actually needs, the same way
it already did once.

---

## 4. The ToolDevice pattern (generalizing the Range Rod)

`IMPLEMENTATION_PLAN.md` Slice 1 names this explicitly: *"future legibility
surfaces... follow the same shape."* Formalize it now so Slice 2+ tools
(stock/rate readouts, and any Strand D/E/G tool implied by `STORYLINE.md`,
e.g. a marked ribbon or rope for `frac.build-from-unit` / `len.number-line`)
don't reinvent it.

**Interface (`tool-device.js`):**

```js
// A ToolDevice is a plain object registered by item id.
// {
//   itemId: number,              // the ITEM_INFO key, e.g. RANGE_ROD
//   onUpdate(dt, ctx): void,     // called every frame ONLY while held;
//                                // ctx = { camera, raycastVoxel, player }
//   screenText(): string,        // returns the current LCD readout text;
//                                // called after onUpdate
// }
// registerTool(device) / getToolFor(itemId) — simple map, no magic.
```

`range-rod.js` becomes: `rough()`, `rangeBand()` (pure helpers, unchanged
logic) plus one `registerTool({ itemId: RANGE_ROD, onUpdate, screenText })`
call replacing the old `updateMeasure`/`paintToolScreen` special-casing in
the main loop. `main.js`'s loop calls `getToolFor(heldItemId)?.onUpdate(...)`
unconditionally — no per-tool `if` branches outside `tools/`.

**Guardrail carried over from Slice 1:** every `screenText()` must stay
magnitude-rounded / plain-language (per `MATH_PLAN §1` rule 2) — a device
that prints an exact-to-the-block number has failed the concealment test the
same way a dialogue line stating a fact would.

---

## 5. Quest / settler data model

Replace the hardcoded body of `spawnSettlers()`/`addSettler()` with data
matching `STORYLINE.md §3` and §5, so adding a settler context is a data
change, not a code change.

**Settler definition shape (`quest-data.js`, one entry per `STORYLINE.md §3`
row):**

```js
{
  id: 'pip',                          // stable slug
  displayName: 'Pip',
  strandNodes: ['len.select-tool', 'len.unit-size-matters', /* ... */],
  spawn: { biome: 'ridge', nearSpawnRadius: 15 },  // world-gen placement hint
  contexts: [                          // ordered; see STORYLINE §5 "Context N"
    {
      id: 'pip.range-rod',             // == the shipped Slice 1 behavior
      trigger: { type: 'proximity', dist: 7, once: true },
      grantsItem: RANGE_ROD,
      lines: {
        approach: 'I have shaky hands — can you measure that ridge for me?',
        grant: 'Thank you — that ridge is far. Take my range rod; it suits steady hands.',
      },
      nodeIds: ['len.select-tool', 'len.estimate'],
    },
    // further contexts follow the same shape; see STORYLINE.md §5.2 for
    // Pip's Context 2–4 content to encode next
  ],
}
```

**Rules:**
- `nodeIds` on every context must be a subset of `SKILL_HIERARCHY.md`'s
  table for that settler's strand(s) — this is what makes §7's cross-check
  script (§9) possible.
- `trigger` types start with `proximity` (what's shipped) and
  `item-held` / `task-complete` (needed once contexts chain, e.g. Corwin's
  Context 3 needs both Context 1 and 2 done first — express that as
  `trigger: { type: 'contexts-done', ids: ['corwin.sundial', 'corwin.trade'] }`).
- `lines` stay short, in-character, and — per the non-negotiable rules in
  §0 — never name a math concept. If a line is hard to write without
  naming one, the *context* design is wrong, not the line.
- This file is content, not logic. A future content-only contributor (or a
  smaller model doing a narrative pass) should be able to add a new context
  by only editing this file plus, if new dialogue triggers are needed,
  `npc.js`'s trigger evaluator — never `main.js` or the render/physics
  layers.

---

## 6. Why a server, and what it owns

Restating `MATH_PLAN §11`'s split precisely: the client stays authoritative
for **right now** (world state, physics, whether a build fits); the server
is authoritative for **the learner over time** (mastery, rung, which
context to surface next, a settler's verbosity). Nothing about *rendering*
the world ever needs the server; nothing about *personalizing* it should
live only on the client (a page refresh must not erase progress).

**App name:** `Vera` (OTP app), `VeraWeb` (Phoenix web layer) — matches the
repo name `vera_game`.

### 6.1 Contexts (Phoenix/Elixir module boundaries)

| Context | Owns | Does NOT own |
|---|---|---|
| `Vera.Curriculum` | the skill graph as data: nodes, strands, prereqs, rung — a direct encoding of `SKILL_HIERARCHY.md` | any per-player state |
| `Vera.Learning` | per-player state: `Player`, `MasteryRecord` (one per player × node), `BehaviorEvent` log | deciding *what to do* with that state |
| `Vera.Adaptive` | the engine: ingests `BehaviorEvent`s, updates `MasteryRecord`s, computes rung transitions (`MATH_PLAN §5`), decides next context/verbosity | persistence details (delegates to `Vera.Learning`), rendering |
| `Vera.Narrative` | the settler/quest content: a server-held copy of `STORYLINE.md §5`'s context data (mirrors §5's client `quest-data.js` shape, extended with per-player unlock state) | game physics, rendering |
| `VeraWeb` | Phoenix endpoint, `PlayerChannel` (the seam), JSON encoding of contracts in §7 | any business logic — channels call into contexts, they don't contain adaptive logic inline |

**Player identity (§1's minimal-accounts note):** a `Player` has an
opaque `id` (UUID) minted client-side on first launch and stored in
`localStorage`; sent as the channel's `join` param. No password, no email,
no PII. This is enough to persist mastery across sessions on the same
browser/device and is the *only* identity concept in scope.

### 6.2 Ecto schemas

```
Vera.Curriculum.SkillNode
  id            :string  (primary key, the SKILL_HIERARCHY.md id, e.g. "mult.repeated-groups")
  strand        :string  (one of the 8 strand keys, e.g. "C")
  ccss_codes    {:array, :string}
  rung          :integer (1..5)
  prereq_ids    {:array, :string}
  # seeded once from SKILL_HIERARCHY.md via a mix task (§9); not player-editable

Vera.Learning.Player
  id            :binary_id (primary key, client-minted UUID)
  inserted_at / updated_at

Vera.Learning.MasteryRecord
  id            :binary_id
  player_id     references(Player)
  node_id       references(SkillNode)
  rung_estimate :integer         # this player's current rung for this node
  quality       :string          # "no-sense" | "reasonable" | "exact" — SKILL_HIERARCHY §4
  streak        :integer         # consecutive on-target signals, drives rung-up (MATH_PLAN §5)
  struggle      :integer         # consecutive off-target signals, drives rung-down / re-teach
  last_seen_at  :utc_datetime
  unique_index on [player_id, node_id]

Vera.Learning.BehaviorEvent
  id            :binary_id
  player_id     references(Player)
  node_id       references(SkillNode)   # nullable — some events are ungraded telemetry
  kind          :string   # see the closed vocabulary in §7.1
  payload       :map      # kind-specific fields, see §7.1
  inserted_at
  # append-only; never updated or deleted. This is the audit trail behind
  # every adaptive decision — keep it, don't summarize-and-drop.

Vera.Narrative.SettlerContext
  id            :string (e.g. "pip.range-rod", mirrors client quest-data.js ids)
  settler_id    :string
  node_ids      {:array, :string}
  order         :integer          # position within the settler's context list

Vera.Narrative.ContextUnlock
  id            :binary_id
  player_id     references(Player)
  settler_context_id references(SettlerContext)
  unlocked_at   :utc_datetime
  completed_at  :utc_datetime | nil
```

### 6.3 Migration / seeding note

`Vera.Curriculum.SkillNode` and `Vera.Narrative.SettlerContext` are **seeded
from these markdown documents**, not hand-typed twice. Ship a `mix vera.seed`
task that parses (or, simplest for a first pass, reads a hand-maintained
`priv/repo/seeds/skill_nodes.json` / `settler_contexts.json` that a human
keeps in sync with §3 of `SKILL_HIERARCHY.md` and §5 of `STORYLINE.md`).
Exact JSON shape:

```json
// priv/repo/seeds/skill_nodes.json — one entry per SKILL_HIERARCHY.md row
{
  "id": "mult.repeated-groups",
  "strand": "C",
  "ccss_codes": ["3.OA.1"],
  "rung": 3,
  "prereq_ids": ["mult.equal-groups-total"]
}
```

```json
// priv/repo/seeds/settler_contexts.json — one entry per STORYLINE.md §5 "Context N"
{
  "id": "pip.range-rod",
  "settler_id": "pip",
  "node_ids": ["len.select-tool", "len.estimate"],
  "order": 1
}
```

A drift check (§9) diffs these seed files' id sets against the markdown
tables so the docs and the data can't silently diverge.

---

## 7. The seam: client ↔ server contracts

One Phoenix Channel, topic `"player:<player_id>"`. Two message directions,
matching `MATH_PLAN §11`'s "behavior-events-up / decisions-down." **Nothing
in either payload names a math concept, a grade level, or a score** — this
is the technical enforcement of the concealment rule at the one boundary
easiest to leak it across.

### 7.1 Client → server: `behavior_event`

```json
{
  "kind": "estimate_submitted",
  "node_id": "area.as-multiplication",
  "context_id": "bram.floor-a-room",
  "payload": {
    "estimate": 24,
    "actual": 20,
    "within_tolerance": true
  },
  "client_ts": 1234567890
}
```

Closed vocabulary for `kind` (extend deliberately, not ad hoc — each new
kind needs an `Vera.Adaptive` handler, §7.3):

| `kind` | When the client emits it | Key `payload` fields |
|---|---|---|
| `estimate_submitted` | player commits to a quantity/plan before the world confirms it (a build, a pile, a route) | `estimate`, `actual`, `within_tolerance` |
| `task_completed` | a settler context's success condition is met | `success: true`, `attempts` |
| `task_struggled` | player re-attempted the same context ≥2 times or asked for a hint | `attempts`, `hint_shown` |
| `demonstration_seen` | player witnessed an Environmental/Social channel moment (Wren re-bundling, Bram tiling) tied to a node | `passive: true` |
| `context_unlocked` | a new settler context became reachable | — |

### 7.2 Server → client: `decision`

```json
{
  "kind": "context_available",
  "settler_id": "wren",
  "context_id": "wren.winter-tally",
  "verbosity": "quiet"
}
```

| `kind` | Meaning | Key fields |
|---|---|---|
| `context_available` | unlock a new settler context (`ContextUnlock` row created) | `settler_id`, `context_id`, `verbosity` (`"chatty"` \| `"quiet"` \| `"silent"` — drives dialogue density per `STORYLINE §3`'s "fades by" column) |
| `rung_adjusted` | a node's `rung_estimate` moved — purely internal-state; the client uses this **only** to pick which context tier to offer next, never to display anything | `node_id`, `direction: "up"|"down"` |
| `reteach_hint` | per `MATH_PLAN §5`, "demonstration first" — tells the client to trigger a Social-channel demonstration moment before any Dialogue hint | `node_id`, `settler_id` |

Client-side (`net/phoenix-socket.js`, `telemetry/behavior-events.js`):
batch `behavior_event`s (don't spam one per frame — buffer and flush on
task boundaries), and apply `decision`s by calling into `npc/quest-data.js`'s
unlock state and `npc/dialogue.js`'s verbosity setting. **The client must
keep working with zero server connection** (offline-tolerant, per
`MATH_PLAN §11`): if the channel is unavailable, contexts default to their
lowest-rung tier and nothing crashes. This is a hard requirement, not a nice
-to-have — the existing game has no backend today and must not regress if
the server is briefly down.

### 7.3 `Vera.Adaptive`'s job, precisely

Given a `BehaviorEvent`, `Vera.Adaptive`:
1. Loads the `MasteryRecord` for `{player_id, node_id}` (creates one at
   `rung_estimate = node.rung, quality = "reasonable"` if absent).
2. Updates `streak`/`struggle` per the event kind (`estimate_submitted`
   within tolerance → `streak += 1, struggle = 0`; `task_struggled` →
   `struggle += 1, streak = 0`).
3. Applies `MATH_PLAN §5`'s thresholds (tune during playtesting, per
   `MATH_PLAN §9`'s "still open" note — start with `streak >= 3` to rise,
   `struggle >= 2` to fall/reteach; these are config, not hardcoded).
4. On a rise: check `Vera.Curriculum` prereqs are satisfied for the next
   node/context before emitting `context_available`.
5. On a fall: emit `reteach_hint` before any `context_available` for that
   node — demonstration before dialogue, per `MATH_PLAN §5`.

This logic is pure and testable without the channel: `Vera.Adaptive` should
expose a plain function (e.g. `Vera.Adaptive.handle_event(mastery_record,
event) :: {updated_record, [decision]}`) that `VeraWeb.PlayerChannel` calls
and then persists/broadcasts the result. Keep the channel a thin transport
layer.

---

## 8. Task breakdown

Extends `IMPLEMENTATION_PLAN.md`'s slice map with file-level detail. Update
that document's table (don't duplicate it) as each slice lands; this table
is the "how," that one stays the "what/status" ledger.

| Slice | This handoff's detail | Depends on |
|---|---|---|
| **A — module refactor** (new; do first) | Split `game.js` per §3's layout, behavior-identical. Verify with `node --check` on every file + a manual play session against current build. | none |
| **1 — Range Rod** *(done)* | Re-home into `inventory/tools/range-rod.js` + `tool-device.js` per §4, during Slice A only — no behavior change. | A |
| **2 — stock/rate readouts** | Second `ToolDevice` (or a HUD-embedded always-on readout, per `IMPLEMENTATION_PLAN.md`'s existing framing — resolve which during implementation, both fit §4's interface) | A, 1 |
| **3 — Social channel: Bram** | `quest-data.js` entries for Bram's Contexts 1–5 (`STORYLINE §5.3`); extend `npc.js`'s trigger evaluator for `item-held`/`contexts-done` triggers if Bram's contexts need them | A, 5's schema (for `nodeIds` to mean anything server-side) but can ship client-only first with `nodeIds` inert |
| **4 — Economy: derived build costs** | `area.tiling`/`area.as-multiplication` made real: a build task's material count must be computed from a *visible* footprint, never handed over (`MATH_PLAN §6` Rung 3 guardrail) | 3 |
| **5 — Adaptive engine online** | Stand up `Vera` (Phoenix app), §6's contexts/schemas, §7's channel + contracts, the seed task. Wire `telemetry/behavior-events.js` + `net/phoenix-socket.js` on the client. | A, 3, 4 |
| **6 — remaining settlers** | Wren, Nettie, Fen, Corwin per `STORYLINE §5.1, 5.4–5.6`, same pattern as Bram | 5 (so unlocks/verbosity are real, not stubbed) |
| **7 — the Overlook** | `STORYLINE §6`'s capstone task; gate check ("≥4 towers lit") reads `ContextUnlock` rows server-side | 6 |
| **8 — concealment audit** | Cross-check script (§9) + a manual pass reading every line against `MATH_PLAN §8` | all above |

---

## 9. Guardrails, conventions, and verification

**Drift check (build this early, in Slice 3 or 5):** a small script
(`scripts/check_traceability.*`, language matching wherever it's easiest —
Elixir `mix` task if it lives server-side, Node script if client-side) that:
1. Parses the node ids out of `SKILL_HIERARCHY.md §3`'s tables.
2. Parses `nodeIds`/`node_ids` out of `quest-data.js` and
   `settler_contexts.json`.
3. Fails CI/local run if either side references an id the other doesn't
   have — catching exactly the "docs and data diverged" failure mode this
   whole handoff exists to prevent.

**Naming conventions:**
- Skill node ids: `strand-shorthand.kebab-case-name`, matching
  `SKILL_HIERARCHY.md` exactly, character-for-character — this id is the
  join key across every layer (client quest data, seed JSON, Ecto rows,
  behavior events). Never invent a new spelling.
- Settler context ids: `<settler_id>.<kebab-slug>`, matching `STORYLINE.md`
  §5's "Context N" headers in spirit (the slug should be recognizable from
  the section title).

**Every PR/commit touching gameplay content answers, in its description:**
- Which `SKILL_HIERARCHY.md` node id(s) it implements.
- Which `STORYLINE.md` settler/context it belongs to.
- A one-line concealment self-check: "would a player describe this as a
  math lesson?" — if the honest answer is "maybe," don't ship it as-is.

**Testing checklist per slice:**
- `node --check` (or the Elixir equivalent, `mix compile --warnings-as-errors`)
  passes clean.
- Client: manually play the affected path with the browser console open —
  no errors, no dropped frames from a new per-frame allocation (reuse
  vectors/objects the way the existing code already does — see `_mv` in the
  current `game.js` for the pattern to follow).
- Server: the pure `Vera.Adaptive.handle_event/2`-style functions get unit
  tests with no channel/DB involved; a thin integration test covers one
  full `join → event → decision` round trip per new event `kind`.
- Concealment: read every new dialogue line aloud — if it would fit in a
  worksheet, rewrite it as an action instead of a statement.

---

## 10. Open decisions for a human (do not guess these)

- Exact rung-transition thresholds (`streak`/`struggle` numbers in §7.3) —
  `MATH_PLAN §9` already flags this as playtesting-dependent, not a design
  call an implementer should freeze unilaterally.
- Whether Slice 2's stock/rate readout is a `ToolDevice` or an always-on HUD
  element (§8's Slice 2 row) — both satisfy the architecture; it's a feel
  decision.
- The exact wording of every settler line beyond what `STORYLINE.md §5`
  already quotes — that document gives the *shape* of each line; a smaller
  model extending it should draft new lines but flag them for a human pass
  on tone, per `MATH_PLAN §9`'s "character copy... must stay in-character."
