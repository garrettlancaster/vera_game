# STORYLINE — The Signal Chain

The narrative layer that gives `SKILL_HIERARCHY.md`'s 46 nodes a world to live
in. Every design choice here follows `MATH_PLAN.md`'s four channels (§4) and
its anti-goals (§8): nothing below reads as a lesson, a quiz, or a level. It
reads as a voxel frontier with people in it who need help.

This document assumes the existing world (`game.js`): a valley of grass,
forest, desert, and river biomes, day/night, mobs, and — already built, per
`IMPLEMENTATION_PLAN.md` Slice 1 — one settler, **Pip**, who has granted the
player a Range Rod. Everything below extends that world; it changes nothing
already shipped.

---

## 1. Premise

The player spawns at **Hearth Camp**, the one outpost still fully lit, at the
center of a valley. Six other outposts ring the valley — each once connected
to Hearth Camp by a supply route and a signal tower, both gone quiet after a
hard winter scattered the settlers who ran them. Nobody frames this as a
crisis; it's simply the state of the world the player wakes into, the way
Minecraft's "you're just here" opening is.

Each outpost has **one settler** still holding on, each stuck on a problem
that is, unannounced, the practical shape of one `SKILL_HIERARCHY.md` strand.
Helping them is not "doing homework for the NPC" — it's the ordinary
Minecraft-y loop of noticing someone needs something and having (or building,
or figuring out) the means to provide it. The reward is always **capability**,
never a score: a tool, an opened route, a lit tower, a new recipe.

When enough towers are lit, a seventh place opens: **the Overlook**, a
half-built bridge across the valley's widest stretch of river that no single
outpost could finish alone. Finishing it is the closest thing the game has to
an ending, and finishing it is only possible by combining reasoning from every
strand — which is the honest answer to "the player should never finish the
game without learning math": the capstone doesn't *test* that; it's simply
unbuildable without it, the same way a real bridge is.

The world does not end there. Past the Overlook the valley continues
(procedurally, per the existing `generateWorld()`), and the game keeps being
a sandbox — the story is the spine, not a fence.

---

## 2. Structure

```
                         ┌─────────────┐
                         │  Hearth Camp │  ← spawn, Wren (Strand A/B)
                         └──────┬──────┘
              ┌──────┬──────┬──┴───┬──────┬──────┐
           Ridge   Quarry  Mill  Grove  Crossroads (Pip exists here already
           (Pip)   (Bram) (Nettie)(Fen)  (Corwin)     — see §2.1 note)
           Str. D  Str.C/F Str. E Str. G  Str. H
              └──────┴──────┴──────┴──────┴──────┘
                            │
                     The Overlook (capstone)
                     — the unfinished bridge —
```

**§2.1 note on Pip's placement.** The shipped Slice 1 spawns Pip a short walk
from Hearth Camp, not at a distinct "Ridge" biome — that's fine and should
stay as-is; Pip's outpost *is* "the Ridge," a lookout point close enough to be
the player's first settler contact (per the onboarding sequence, §7). The
other five outposts are farther out, one per major biome region the world
generator already produces (forest, desert/quarry rock, riverside, open
grove, crossroads clearing).

**Unlock order is soft, not gated.** The player can walk to any outpost in
any order — this is still a sandbox. But three structural nudges keep the
*effective* order close to the skill graph's prerequisites (`SKILL_HIERARCHY
§5`), without ever blocking the player:
1. **Distance.** Wren (Hearth Camp) and Pip (the Ridge) are close to spawn;
   the other four are progressively farther, so early play naturally meets
   the Rung 2–3 strands first.
2. **Task legibility.** An outpost's *first* request is always its
   lowest-rung node. A player who wanders straight to Nettie's mill at Rung 1
   just gets the simplest fair-share request there is — the content adapts
   down (`MATH_PLAN §5`), it never turns the player away.
3. **The Overlook is a hard gate**, and only the Overlook: it visibly cannot
   be built (missing spans, no measured plan) until at least four of the six
   towers are lit. This is the one place the story insists on breadth, and it
   insists the way an unfinished bridge insists — by being obviously
   unfinished, not by a locked door with a checklist on it.

---

## 3. The cast

Per `MATH_PLAN §9`'s ruling (a small named cast, each legible as a single
skill-model), six settlers plus the existing world's unnamed mobs (which stay
pure "yield data," per the same section).

| Settler | Outpost | Strand(s) | Motif | Fades by |
|---|---|---|---|---|
| **Wren** | Hearth Camp | A. Quantity & Counting, B. Place Value & Arithmetic | quartermaster; tally-sticks, bundled stock | Rung 3 |
| **Pip** *(exists)* | the Ridge | D. Measurement & Length | ranger; Range Rod, shaky hands | Rung 4 |
| **Bram** | the Quarry | C. Multiplicative Reasoning, F. Geometry & Shape | mason; builds in rows, counts by tiling | Rung 4 |
| **Nettie** | the Mill | E. Fractions | miller/baker; dough, pies, ribbon by the river | Rung 5 |
| **Fen** | the Grove | G. Data & Graphs | naturalist; tally board of tracks and catches | Rung 5 (never fully silent — data is a *habit*, not a mastered fact) |
| **Corwin** | the Crossroads | H. Time & Money | trader; a sundial-cart and a coin box | Rung 3 |

Every settler's dialogue budget shrinks as the player's mastery in that
settler's strand rises (`MATH_PLAN §4.3`, §9). A player who's clearly fluent
with fractions gets a nod and a task from Nettie, not an explanation.

---

## 4. Onboarding — the first ten minutes

Follows `MATH_PLAN §7` exactly, populated with this cast:

1. **Pure sandbox.** Spawn at Hearth Camp. Move, mine, place, eat. No
   dialogue at all — this matches the current shipped game precisely.
2. **Incidental noticing.** Within sight of spawn, Wren is visible at the
   stores, stacking blocks into piles of ten out loud to no one in
   particular ("...eight, nine, ten — that's a bundle"). The player is not
   approached.
3. **First nudge.** Pip, a short walk off (as already shipped), asks for
   help measuring the ridge — the one request already implemented. This is
   the game's first *directed* interaction, and it's already proven to read
   as "a stranger asked a favor," not a lesson (`IMPLEMENTATION_PLAN.md`
   Slice 1's concealment test).
4. **Player-led.** From here the valley is open. Nothing forces the player
   toward Wren, Bram, Nettie, Fen, or Corwin; the world simply contains them,
   the way it contains mobs and biomes.

---

## 5. Per-settler questlines

For each settler: the strand nodes it covers, and **at least two distinct
gameplay contexts** that exercise the same underlying reasoning — because a
single scenario teaches a trick, and two different scenarios are what make
the reasoning transfer (`MATH_PLAN §5`'s mastery bar: "the *same* reasoning
transfers to a *new* context"). Each context is tagged with its `MATH_PLAN
§4` channel(s).

### 5.1 Wren — Hearth Camp (Strand A + B)

Nodes: `count.compare`, `count.subitize-5`, `count.skip-5-10-100`,
`count.odd-even`, `count.equal-groups-array`, `place.hundreds-bundle`,
`place.compose-hundreds`, `place.read-write-1000`, `place.compare-3digit`,
`add.fluent-20`, `add.fluent-100`, `add.four-2digit`, `add.within-1000`,
`add.explain-strategy`, `round.nearest-10-100`, `add.fluent-1000`.

- **Context 1 — "Is that enough?" (Environmental + Social).** Wren keeps
  visible stock piles (bundled into tens, per `place.hundreds-bundle`) at the
  stores. Bringing in mined blocks to trade, the player sees Wren physically
  re-bundle the new stock into tens and hundreds while muttering the running
  total — the *world* restacking itself is the lesson, no dialogue required.
  Covers `count.skip-5-10-100`, `place.compose-hundreds`.
- **Context 2 — the winter tally (Social + Challenge).** Later, Wren asks the
  player to help reconcile two stacks that don't match (an odd/even
  mis-split, or a three-digit comparison between "what we have" and "what the
  ledger says") — the fix is walking the piles side by side, not doing sums
  on paper. Covers `count.odd-even`, `place.compare-3digit`,
  `add.explain-strategy`.
- **Context 3 — the resupply run (Challenge, later Rung 3–4).** Wren needs a
  cart loaded for a route of a given rough distance; the player estimates
  what four-2-digit or within-1000 quantities of goods will "round out" the
  cart, using `round.nearest-10-100` to keep the guess sane rather than
  exact. This is the *same* combine-and-compare reasoning as Context 1, now
  at three-digit scale and under a practical constraint.

### 5.2 Pip — the Ridge (Strand D) *(partially shipped)*

Nodes: `len.select-tool`, `len.unit-size-matters`, `len.estimate`,
`len.difference`, `len.word-problems`, `len.number-line`.

- **Context 1 — the Range Rod (shipped).** Measuring the ridge's distance and
  rise via the rod's screen, magnitude-rounded (`rough()`). This is
  `len.select-tool` + `len.estimate` in their purest form — already live.
- **Context 2 — "how much higher" (Environmental + Dialogue).** Pip later
  asks the player to compare two landmarks' heights using the rod twice and
  reasoning about the *difference*, not two raw numbers — `len.difference`.
- **Context 3 — pacing a route without the rod (Social + Challenge).** Pip
  demonstrates pacing out a shorter gap on foot ("about six of my strides")
  when the rod is impractical up close, showing that a *different* unit
  (a stride) measures the *same kind of thing* a long-range reading does —
  `len.unit-size-matters` — and sets up `len.word-problems` when the player
  is later asked to plan a short bridge or fence run using a paced-out
  length plus simple addition.
- **Context 4 — the survey line (Rung 4).** Pip's outpost keeps a marked
  rope with even knots — a physical number line — used to lay out an
  addition of measured segments for a longer structure. `len.number-line`.

### 5.3 Bram — the Quarry (Strand C + F)

Nodes: `mult.equal-groups-total`, `mult.repeated-groups`, `div.fair-share`,
`mult.div.word-problems`, `mult.unknown-factor`, `mult.properties-felt`,
`mult.fluent-100`, `mult.two-step`, `mult.patterns`, `area.tiling`,
`area.as-multiplication`, `area.distributive-model`, `perimeter.vs-area`,
`geo.attributes`, `geo.rows-columns`, `geo.categories`,
`geo.partition-equal-area`, `mult.by-10s`.

- **Context 1 — stacking a wall (Environmental).** Bram is visibly building
  a wall in rows, counting "a row of five, four rows" rather than a raw
  tally — the array is the wall. `mult.equal-groups-total`,
  `mult.repeated-groups`.
- **Context 2 — "how many stones for the floor?" (Challenge).** The player
  is asked to floor a room of a given footprint. The room is *visible and
  walkable*, so the requirement is tileable by eye/by counting steps
  (`area.tiling`), and the shortcut of multiplying the two edges is
  something the player can *discover* by noticing the row-count pattern from
  Context 1 — `area.as-multiplication`. Guardrail: the footprint must never
  be handed over as two numbers only; the player must be able to walk or
  look at it.
- **Context 3 — splitting an L-shaped room (Challenge + Social).** A room
  with a jog in the wall — not a plain rectangle — requires splitting it
  into two rectangles and adding their tile counts. Bram demonstrates this
  once on a smaller L nearby before asking the player to do the real one.
  `area.distributive-model`, `perimeter.vs-area` (Bram also asks how much
  *fence*, not floor, the same room would need — same shape, different
  question).
- **Context 4 — sorting the quarry's stone by shape (Environmental).**
  Quarried stone comes in recognizably different block-shapes; Bram sorts
  them by shared attributes into bins, thinking aloud about what makes two
  different-looking pieces both belong in the "four equal sides" bin.
  `geo.attributes`, `geo.categories`.
- **Context 5 — dividing the roof rafters / an unfair delivery (Social +
  Challenge, Rung 3).** A delivery of beams arrives and must be split evenly
  among the wall's four corner posts — `div.fair-share`, `mult.unknown-factor`
  — and, separately, Bram notices a pattern while restocking (every fourth
  beam bundle comes out even) and wonders aloud why, inviting the player to
  check with their own bundles. `mult.patterns`.

### 5.4 Nettie — the Mill (Strand E)

Nodes: `frac.equal-shares`, `frac.unit-fraction`, `frac.build-from-unit`,
`frac.number-line`, `frac.equivalence`, `frac.compare-same-num-denom`.

- **Context 1 — splitting a pie (Environmental + Social).** Nettie is seen
  cutting a pie into equal wedges for however many are eating, narrating the
  cut count, not a fraction word. Helping serve it is `frac.equal-shares` /
  `frac.unit-fraction` — the player *sees* that "a third" is one of three
  equal wedges of *this* pie, and that the same word means a different-size
  piece for a bigger pie (echoing the "size of the whole matters" point in
  the CCSS narrative for Grade 3).
- **Context 2 — measuring ribbon for wrapping (Challenge).** A length of
  ribbon (tying back to Strand D's number line) is marked off in equal
  fractional hops to wrap a set of parcels — `frac.build-from-unit`,
  `frac.number-line`. This is deliberately the *same* number-line action as
  Pip's knotted rope (§5.2 Context 4), now with fractional hops instead of
  whole ones — the transfer the mastery model is watching for.
- **Context 3 — "which batch is bigger" (Dialogue + Challenge, Rung 5).**
  Two batches of dough were split into different numbers of loaves; Nettie
  asks which portion is bigger without measuring — pure `frac.equivalence` /
  `frac.compare-same-num-denom` reasoning from the shares in front of the
  player, never a symbolic comparison.

### 5.5 Fen — the Grove (Strand G)

Nodes: `data.line-plot`, `data.picture-bar-graph`, `data.line-plot-fractional`.

- **Context 1 — the tally board (Environmental).** Fen keeps a physical board
  of animal sightings, one mark stacked per sighting per day — a line plot
  the player can simply *look at* and see which day had the most.
  `data.line-plot`.
- **Context 2 — restocking the smokehouse (Challenge).** Using the board (or
  the player's own catch log, if the game tracks drops per session), decide
  which animal to hunt more of based on which bar/stack is visibly short —
  `data.picture-bar-graph`, tying directly back to the existing
  `MOB_TYPES` yield ratios that `MATH_PLAN §2` already identified as
  implicit proportional data.
- **Context 3 — the weather log (Environmental, Rung 5).** Fen's board later
  tracks something measured in fractional units (rainfall against a marked
  gauge, echoing Nettie's ribbon) — `data.line-plot-fractional` — showing
  that the same stack-and-compare habit still works when the units aren't
  whole numbers.

### 5.6 Corwin — the Crossroads (Strand H)

Nodes: `time.tell-5min`, `money.coin-value`.

- **Context 1 — "meet me at..." (Dialogue + Environmental).** Corwin's cart
  has a sundial-face clock; he asks the player to return "when the shadow's
  here" (a five-minute position), teaching the clock as a *position to
  match*, not a number to compute. `time.tell-5min`.
- **Context 2 — the trade (Challenge).** Buying/selling at the cart totals a
  small handful of coin-like tokens dropped by mobs or found in the world;
  the player combines values to meet a price, the same combining reasoning
  as Wren's tallies but with denominations instead of bundles of ten.
  `money.coin-value`.
- **Context 3 — "back before the shadow reaches the post" (Dialogue,
  combines both nodes).** A timed favor that requires reading the sundial
  *and* affording something at the cart in the same errand — light,
  optional, and only offered once both nodes are already comfortable.

---

## 6. The Overlook — the capstone

The valley's river (already generated by `riverZ`/`riverHalfW`) is at its
widest at a point visible from Hearth Camp from the start — a half-collapsed
bridge stub on each bank, clearly unfinished, present in the world from hour
one as a landmark the player can see but not yet cross.

Once at least four of the six towers are lit, a seventh settler — no new
character needed; Bram and Pip both gravitate here, in character, since a
bridge is both a measured span and a built structure — is found surveying
the gap. Finishing it requires, in one connected task:

1. **Measuring the span** (Pip's strand: `len.estimate`, `len.number-line`)
   to know how many spans of a known length are needed.
2. **Costing the material** from that span count the way Bram's floors were
   costed (`area.as-multiplication`, `mult.two-step` — the beam count *and*
   the plank count are two connected quantities, not one).
3. **Estimating first, building second** (`round.nearest-10-100`,
   3.OA.8's reasonableness check) — the game accepts a workable plan before
   exact material counts, consistent with `MATH_PLAN §1`'s number-sense-first
   rule.

No dialogue frames this as a test. It reads exactly like Minecraft's "build a
bridge across the river" — because it is one. What makes it a fitting
capstone is that it's the one structure in the game genuinely too large to
eyeball without the reasoning the six outposts built up, which is what
satisfies the brief's "never finish without learning math": not a locked
door, just a bridge nobody could otherwise size correctly.

**After the Overlook.** The far bank opens into more of the procedurally
generated valley. No end screen, no credits — consistent with the sandbox
genre and with `MATH_PLAN §8`'s ban on anything that announces "you finished
the lesson."

---

## 7. Cross-reference: node → character → channel

A condensed index for `DEV_HANDOFF.md` to turn into seed/task data. "Channel"
uses `MATH_PLAN §4`'s codes: **E**nvironmental, **S**ocial, **D**ialogue,
**C**hallenge.

| Strand | Settler | Primary channels | Example verb in-world |
|---|---|---|---|
| A. Quantity & Counting | Wren | E, S | stacking/re-bundling stock |
| B. Place Value & Arithmetic | Wren | S, C | reconciling tallies, loading a cart |
| C. Multiplicative Reasoning | Bram | E, C | stacking rows, flooring a room |
| D. Measurement & Length | Pip | E, D | reading the rod, pacing a gap |
| E. Fractions | Nettie | E, C, D | cutting a pie, marking ribbon |
| F. Geometry & Shape | Bram | E, S | sorting stone, splitting an L-room |
| G. Data & Graphs | Fen | E, C | reading the tally board |
| H. Time & Money | Corwin | D, C | matching the sundial, trading |
| (capstone, all strands) | Pip + Bram | C | building the Overlook bridge |

This table is the thing a smaller implementing model should consult before
writing any new NPC line: **every line of dialogue must trace to a row
here**, or it doesn't belong in the game (the `MATH_PLAN §8` concealment
audit, made concrete).
