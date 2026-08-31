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
node server.mjs          # static server, http://127.0.0.1:8321
node --check game.js     # syntax gate after any game.js edit
```

Slice 1 is client-only: no Phoenix. It adds one NPC line (the ask/grant), not a
dialogue system, and changes no existing gameplay.
