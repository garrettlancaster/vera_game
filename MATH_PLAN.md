# MATH_PLAN — Hiding Math in the World

A top-level design for weaving mathematics into **Cube World** without ever
looking like a math game. This is a concept plan: it decides *what* the math
is, *where* it lives in gameplay, and *how* difficulty grows. It deliberately
ignores implementation detail — that comes later.

The source of truth for the world's systems is `PLAN.md`; the concrete systems
the plan hooks into are the ones already sketched in `game.js` and `README.md`.

---

## 1. Core principle

> **Math is the currency of the game, not its content.**

Every mechanic the player already cares about (building, eating, surviving,
exploring) is re-expressed so that doing the math *is* doing the task — there
is no separate "solve a problem, then reward" loop. The instruction is hidden
because the player never sees a problem; they see a goal, and the goal happens
to require reasoning.

Three rules govern every design choice below:

1. **Concealment.** The player should be able to finish the game without ever
   knowing they were "learning math." If a feature reads as a lesson, it fails.
2. **Number sense over rote.** We reward *intuition and estimation* first and
   *procedure* second. A player who eyeballs "that's about 12" is as good as one
   who counts to 12. Rote is a fallback, not the goal.
3. **A natural hierarchy.** Difficulty follows the order in which understanding
   *actually* develops (concrete → spatial → symbolic → abstract), never the
   order a curriculum is written. See §3.

---

## 2. Where math already lives in the current world

The existing game is already quietly mathematical. The first job of the plan is
to *make the math legible to the learner* without changing how it feels to play.

| Existing system | The math it already implies | Opportunity |
|---|---|---|
| Voxel grid + mining/placing | Whole-number units, coordinates | Spatial reasoning, counting on a lattice |
| `MOB_TYPES` drop rates (cow→3, sheep→2, chicken→1 meat) | Ratios, "how many animals for N meals" | Multiplicative thinking, estimation |
| Hunger drains at a *rate*, refilled in *units* | Rate × time = quantity | Planning, proportion |
| Cull distance / region streaming / fog | Distance, scale, "how far / how big" | Estimation, magnitude |
| Day/night + oxygen countdowns | Time, duration, countdowns | Temporal reasoning |
| Debug HUD (pos, bearing, pitch) | Coordinates, angles, direction | Measurement, orientation |
| Biome regions (noise thresholds) | Probability, "how likely / how common" | Chance, data sense |

These are not features to bolt math *onto*; they are the seams where math
already bleeds through. The plan's first layer is simply to let the player
**notice and lean on** the ones that are already there.

---

## 3. The difficulty hierarchy

Difficulty is not a single number; it is a *ladder of understanding* that the
game climbs alongside the player. Each rung builds on the one below. The
adaptive engine (§5) moves the player up and down this ladder, not on an
arbitrary difficulty slider.

```
Rung 5  Abstract / symbolic      "if I build this, what happens?"  — prediction
Rung 4  Spatial / structural     coordinate reasoning, symmetry,   — "where / how
Rung 3  Proportional / rate      "how many for how much, how long" — many for how much"
Rung 2  Counting / cardinality   "how many, how much, how far"    — counting on the grid
Rung 1  One-to-one / comparing   "more / less / same"             — the floor
Rung 0  Perception & action      "I can move, see, build"          — pre-math fluency
```

- **Rung 0–1** is the onboarding: no teaching, just a world that *responds*.
- **Rung 2–3** is where most instruction hides, because these are the operations
  the game already performs under the hood.
- **Rung 4–5** are rewards: they open *possibilities* (build bigger, plan ahead)
  rather than test the player.

**The natural order is enforced, not assumed.** The player cannot reach Rung 5
because the world has not yet given them Rung 2 material. Each rung's content is
*prereq-gated* by what the earlier rungs required.

---

## 4. The four channels of instruction

PLAN.md calls for two flavors of AI help — *direct* (talking to the player) and
*indirect* (observable problem-solving). Extending that, math reaches the player
through four channels. A single idea can travel through several at once; the
strongest design uses **two channels per idea** so it is both taught and
demonstrated.

### 4.1 Environmental (the world teaches by being)
Math is *encoded in the world itself*, so doing the task is doing the math.
This is the most concealed channel and should be the backbone of the game.

- **Counting is mining.** Every block is a unit. Building a 3×3 wall *is*
  counting to 9. The player who estimates "about 12 stones" before mining is
  doing proportional estimation without being asked to.
- **Ratios are mobs.** A cow yields 3 meals, a chicken 1. "I need to feed
  myself for 6 meals" is, unspoken, a division problem. The world answers it;
  the player just needs to *see* the ratio.
- **Rates are hunger and time.** Hunger drains faster when sprinting; that is a
  rate the player already optimizes. Making the drain *legible* ("burning ~1
  bar per sprint-minute") turns an opaque bar into a rate concept the player
  uses to plan.
- **Scale and distance are traversal.** "The river is 40 blocks wide" or "the
  mountain is ~30 tall" are magnitude judgments the player must make to plan a
  crossing — pure estimation, no symbols required.

### 4.2 Social (the characters teach by doing)
AI characters — the friendly mobs and any new *settler* NPCs — *use* math
out loud while the player watches. This is PLAN.md's "indirect help."

- **Mobs that build.** A settler NPC is observed stacking blocks and muttering,
  "One… two… three… need two more for the roof." The player absorbs
  subitizing and one-to-one correspondence by watching, not being quizzed.
- **Mobs that estimate.** A character says, "That looks like about ten sheep —
  I'll catch two and we'll eat for a while." The player learns to *eyeball*
  quantities and to reason about *yield*.
- **Mistakes the player can correct.** An NPC makes a visible miscount or plans
  a build that will fail. Helping them (and thereby learning the correction)
  is the least "lesson-like" teaching of all.

### 4.3 Dialogue (the companion teaches by asking)
A friendly guide character (PLAN.md's "AI players provide help") speaks to the
player. Its job is *scaffolding*, not lecturing:

- **Fades out as competence grows.** Verbal hints are dense at Rung 1–2 and
  nearly absent by Rung 4–5. A character who still explains addition when the
  player is planning a 20×20 base is doing the opposite of concealing math.
- **Asks questions, not facts.** "Hmm, will that many stones be enough for a
  wall that tall?" *prompts* estimation. "That's 14 stones." would *tell* — and
  tell is what we avoid.
- **Falls back on request.** If the player is genuinely stuck, help is always
  available; it just isn't pushed.

### 4.4 Challenge (the goal teaches by requiring)
Some objectives are *constructed so the only way forward is to do the math*:

- A locked gate, a bridge too far to see across, a meal count that won't add up
  without estimating the herd — the math is the key, not the reward.
- Crucially, these are framed as *practical* problems ("get across", "feed the
  camp"), never as "solve to continue." The math is the tool, the goal is the
  motivation.

**Channel discipline:** prefer Environmental + Social (both passive, both
concealed). Reach for Dialogue only to bridge a gap the passive channels left,
and for Challenge only when the gap is genuinely worth forcing.

---

## 5. Adaptivity: difficulty that breathes

PLAN.md wants difficulty to *increase or decrease* with progress. The mechanism
below is concept-driven; it rides the §3 ladder instead of a raw difficulty
value.

**What the game watches (not test scores — behavior):**
- *Efficiency of estimation.* Does the player over-mine or under-plan?
- *Recovery.* After a bad plan (ran out of meat, a bridge collapsed), does the
  next plan get better?
- *Time-to-correct.* How fast does the player self-correct a miscount?
- *Rung ceiling.* The highest rung the player handles without visible strain.

**How it responds:**
- **Rise a rung** when the player handles the current one with margin *and* shows
  curiosity at the next. Rise *slowly* — one rung per several interactions.
- **Fall a rung** (or slow) when the player is stuck, not when they make a
  single mistake. The goal is to keep the player in the *zone of proximal
  development*: slightly above current comfort, never crushed.
- **Re-teach by demonstration first.** When a player slips a rung, the game
  prefers to show the idea *in the world* (a mob does it) before any direct
  hint. Demonstration preserves the conceit that no one is "teaching."

**Guardrails:**
- Never punish a wrong answer with game-over. (The current `die()` already
  respawns with items kept — extend that warmth to every math "failure": it is a
  *re-plan*, not a death.)
- Track *concept mastery*, not just "got it this time." A player may solve one
  bridge and then struggle at the next; mastery requires the *same* reasoning to
  transfer to a *new* context.

---

## 6. The math concepts, by rung

Each concept is described by **what it is**, **where it hides in the world**,
and **which channels teach it**. This is the content spine of the game.

### Rung 1 — Comparing & one-to-one
- **Concepts:** more/less/same; one-to-one correspondence; "enough."
- **In the world:** deciding whether a handful of blocks is "enough" for a task.
- **Channels:** Environmental (the world says yes/no when you try) + Social (a
  mob compares two piles out loud).
- **Number-sense emphasis:** accept "looks about the same" as correct; exactness
  is not required at this rung.

### Rung 2 — Counting & cardinality on a grid
- **Concepts:** counting to N; that a set *has* a number; subitizing small
  groups (1–4 at a glance).
- **In the world:** mining/placing discrete blocks; a mob that counts its stock
  out loud.
- **Channels:** Environmental (building is counting) + Social (observable
  counting).
- **Number-sense emphasis:** fast small-group recognition beats slow exact
  counting; reward the glance.

### Rung 3 — Proportion & rate
- **Concepts:** "many for how much"; "how long"; ratio of yield; estimating
  quantities ("about ten").
- **In the world:** meat yield vs. meals; hunger drain rate; sizing a build
  against a need; gauging herd size.
- **Channels:** Environmental (the core channel — the game's economy *is*
  proportional) + Challenge (a gate that requires a workable ratio) + light
  Dialogue (a nudge when the ratio is off).
- **Number-sense emphasis:** *reasonable estimates* are accepted; a range, not a
  point answer. "Enough to last" is success even if not "exactly enough."

### Rung 4 — Spatial & structural reasoning
- **Concepts:** coordinates, symmetry, orientation (N/E/S/W from the compass),
  area/perimeter, "how tall / how wide," spatial scaling.
- **In the world:** orienting by the HUD compass + bearing; building symmetric
  structures; judging distance to plan a crossing; reading height.
- **Channels:** Environmental (the world is a lattice; the HUD shows angles) +
  Social (a settler orients by landmarks and direction).
- **Number-sense emphasis:** *spatial intuition* — "that's roughly north,
  quarter-turn off" — over computing a bearing.

### Rung 5 — Prediction & abstraction
- **Concepts:** "if I do X, then Y"; multi-step planning; cause/effect over time.
- **In the world:** planning a build's outcome *before* building; anticipating
  hunger over a long trek; forecasting when a resource runs out.
- **Channels:** Challenge (the goal is a future the player must engineer) +
  minimal Dialogue (the player is now the one doing the reasoning).
- **Number-sense emphasis:** *qualitative* prediction ("it'll probably run out
  before I get home") counts as success before *quantitative* precision.

---

## 7. Onboarding and the first ten minutes

The opening must *never* announce that math is present. Sequence:

1. **Pure sandbox (Rung 0).** Move, mine, place, eat. No text, no character
   speech about anything. The world should feel like the current game.
2. **Incidental noticing (Rung 1–2).** The first mob the player meets is
   *already* counting/comparing out loud, doing an ordinary task. The player
   watches, not responds.
3. **First nudge (Rung 3).** A practical need appears (feed the camp / cross a
   gap) that the player must *reason* about. The companion asks *one* question,
   not a lecture.
4. **Player-led (Rung 4+).** The player starts planning builds and routes on
   their own; the game steps back to observing and demonstrating.

**Design test for onboarding:** a player should be able to describe the first
ten minutes as "I played a voxel game and met some characters" — never "I was
taught math."

---

## 8. Keeping the conceit: what the plan will NOT do

Explicit anti-goals, because the conceit is the whole point:

- **No quizzes, pop-ups, or "solve to continue" screens.** The moment the
  interface stops being a game and becomes a worksheet, the plan has failed.
- **No "math points" or a math scoreboard.** Mastery is measured internally
  (§5); the player sees progress as *world progress* (bigger builds, farther
  travel), never as a lesson score.
- **No lecturing characters.** Characters reason *while doing things*; they do
  not pause the game to teach.
- **No single correct numeric answer as the only success.** Ranges and
  "reasonable" are always acceptable (number sense over rote, per §1 rule 2).
- **No punishment for being wrong.** A wrong plan costs time and a re-plan,
  never death or lockout.

---

## 9. Design decisions (resolved)

The former open questions are resolved here; each names the call and the reason
so the rationale is visible to whoever implements it.

- **Characters: a small named cast of *settlers*; the animals stay as "yield
  data."** The animals (cow→3, sheep→2, chicken→1 meat) already carry the
  proportional metaphor and are the *data* a character reasons about. A few
  named *settler* NPCs provide the Social channel (reasoning out loud) and the
  dialogue fallback — one per domain, so the cast *is* a curriculum: a
  **builder** (count / area / structure, Rung 2–4), a **forager** (yield / rate,
  Rung 3), and a **navigator** (orientation / route, Rung 4). Characters appear
  *in context* — builder at a build site, forager at a camp — never all at
  spawn, and each fades as the player masters its rung. *Reason:* a small cast
  keeps every character legible as a single skill-model, and the animals keep the
  yield metaphor honest instead of forcing animals to "talk."
- **Economy: the food economy *seeds* proportion; a build economy *makes it
  load-bearing*; blocks are the resource.** Meat-yield-vs-meals is the first,
  low-stakes proportional problem — it's already in the game, and the cost of
  being wrong is hunger, not game-over. Rung 3–5 add a *build economy* where a
  project's material cost must be **counted from the visible task** (a 3×3×2 wall
  is 18 blocks; a bridge of length *L* needs *L* spans). *Guardrail:* a
  requirement must be **derivable by looking, never looked up** — otherwise it
  collapses from proportional *reasoning* into recipe *memorization*. No new
  abstract "math currency" is introduced; the existing blocks are it.
- **Guide voice: distributed and fading, not one omnipresent teacher.** There is
  no single companion. Each character speaks *in its domain*, and its verbosity
  is driven by the player's mastery *in that character's rung* (§5): a builder
  chatty at Rung 2 is near-silent by Rung 4. Help is available on a light-touch
  **ask** the player initiates, but is never *pushed* — the passive channels
  (Environment, Social) teach first. *Reason:* one voice that follows you
  everywhere reads as "the teacher"; contextual, fading voices read as "the world
  has people in it."
- **Progress: only *world* progress is shown, never *lesson* progress.** The
  player sees unlocks framed as capability and reach — "you can now bridge that
  gap," "a new site to build at," "the far valley is open" — never as a math
  level or a score. The concept-mastery model lives server-side (§11); the
  player-facing signal is always a game reward. *Reason:* the moment progress
  looks like a lesson, the conceit breaks.
- **Scope: ship Rung 1–3 first; Rung 4–5 are stretch.** Rung 1–2 is nearly free
  (legibility + the animals + one talking builder); Rung 3 is the heart of the
  conceit. Ship that as a complete, *concealed* product before the harder-to-
  conceal spatial/predictive rungs. The adaptive engine (§5) is *designed* for
  all five rungs but only *populated* for 1–3 at first.

### Still open (deferred to implementation, not concept)

These are not concept calls; they are tuning to settle when we build:
- Exact **rung-transition thresholds** for the adaptive engine (§5) — the
  behavior signals exist; the "how much margin / how many interactions per rung"
  constants need playtesting.
- **Character copy** — the actual lines the settlers say. The *structure* (who
  speaks, when, in which domain) is decided; the wording must stay in-character
  and conceal the math, which is a writing task, not a design one.

---

## 10. Sequencing (concept order, not a build order)

This is the order in which the *ideas* should become real, so that each new
idea has the support the previous one provides:

1. **Make the math legible** — expose the counting/rate/scale that's already in
   the world (§2), with zero new mechanics.
2. **Add the Social channel** — characters who reason out loud while working
   (§4.2). This is the backbone of concealment.
3. **Wire the economy to proportion** — make yield-vs-need and hunger-rate
   genuine proportional problems the player solves to play (§6, Rung 3).
4. **Layer the adaptive engine** — behavior-based rung tracking that rises and
   falls the ladder (§5).
5. **Add the Challenge channel** — a few hand-built goals that *require*
   reasoning (§4.4).
6. **Open the upper rungs** — spatial (§6 Rung 4) then predictive (§6 Rung 5)
   as rewards.
7. **Polish concealment** — audit every screen and line of dialogue against the
   §8 anti-goals; remove anything that *feels* like a lesson.

---

## 11. Systems ownership (concept-level, Elixir/Phoenix-shape)

When implementation begins, the **voxel world stays client-side** (the existing
`game.js` core) and a new **Elixir/Phoenix backend owns the *personalization***.
The split answers a single question: *is this about the world right now, or about
this player over time?* "Right now" is client; "over time" is server.

**Client — the world and its immediate, local math.**
- World gen, rendering, physics, mining/placing, movement, and all existing UI
  (hotbar, hearts, hunger, compass).
- **Local math checks** — "did this build fit?", "do I have enough blocks?",
  "is this bridge long enough?" These concern *current world state*, must be fast
  and offline-tolerant, and stay on the client.

**Server (Elixir/Phoenix) — the learner over time.**
- **Adaptive engine** (§5): the player's rung, per-rung concept mastery, and
  behavior history — the longitudinal, personalized state a backend exists for.
- **Mastery model**: the "concept mastery, not got-it-this-time" rubric (§5),
  held as server state rather than client memory.
- **Character AI** (§4.2–4.3): the settlers' behavior, when/how they reason and
  speak, and their per-domain fading. The server *generates* the character
  activity; the client *renders* it.
- **Task & content selection**: which challenge (§4.4) or world event to present
  next, and which rung to target — the server *chooses the task*, the client
  *runs it*.
- **The curriculum itself** (the §3 ladder, rung definitions, and the
  "reasonable-range" acceptance test) as *data the server holds and can evolve
  without a client update.*

**The seam.** The client streams **behavior events** up — the §5 signals: 
estimation efficiency, recovery after a bad plan, time-to-self-correct, build 
attempts, miscounts — and the server pushes back **decisions** (next task,
character presence/verbosity, rung adjustments). The world stays responsive
locally; only the *personalization* round-trips. Nothing the player sees at the
seam is a "math" signal — only a "game" signal — which is what keeps the conceit
intact end to end.

This is concept-level only: no module layout, no code. It exists to tell the
implementer *where* each idea lives, not *how* to build it.

---

## 12. Success criteria

The plan works when, for a player who never knew they were learning:

- They can **do the math** the ladder describes (count on a grid, reason about
  yield and rate, plan a build) *without ever seeing a math question.*
- They can be asked to **describe the game** and they describe a voxel world with
  helpful characters — not a math course.
- A **struggling player rises**, a **stalled player is eased back**, and
  nobody is failed out of the game for a wrong answer.
- Removing every character's speech and every hidden hint would leave the
  *world* intact — the math was in the world, not in the overlay.
