# SKILL_HIERARCHY — the CCSS content spine

This document grounds `MATH_PLAN.md`'s abstract Rung 0–5 ladder in the actual
Common Core State Standards for **Grade 2** and **Grade 3** mathematics. Where
`MATH_PLAN.md §6` sketches the ladder conceptually, this document is the
**canonical, standards-traceable skill graph** — the thing `DEV_HANDOFF.md`
turns into seed data for the adaptive engine, and the thing `STORYLINE.md`
hangs characters and places on.

Nothing here changes `MATH_PLAN.md`'s rules (concealment, number-sense-first,
natural hierarchy, never rote). This document exists to answer one question
precisely: **which standard, in which order, taught as which intuition.**

---

## 1. How to read this document

Each **skill node** is the smallest unit the adaptive engine tracks mastery
for. A node has:

- **id** — stable slug, used in code/data (`count.subitize-5`, `mult.array-area`).
- **CCSS code(s)** — the standard(s) it operationalizes.
- **The intuition** (not the procedure) — the first-principles idea a player
  should *feel*, stated the way a person thinks it, never the way a textbook
  states it.
- **Prereqs** — node ids that must be underway (not necessarily mastered —
  see `MATH_PLAN §5`'s "zone of proximal development") before this node
  activates.
- **Explicit rote to avoid** — the memorized shortcut this node must not
  become. This is the guardrail a smaller implementing model needs most,
  because "add a math skill" defaults to "teach the algorithm" unless told
  not to.

Nodes are grouped into eight **strands** (families of related standards).
Strands are not sequential relative to each other — the player moves through
several in parallel, the way `STORYLINE.md`'s regions work. Within a strand,
nodes are ordered by prerequisite.

---

## 2. The eight strands

| Strand | CCSS domains covered | One-line essence |
|---|---|---|
| **A. Quantity & Counting** | 2.OA.3–4, 2.NBT.1–3 | how many, and how many *tens* of how many |
| **B. Place Value & Multi-digit Arithmetic** | 2.NBT.1–2, 2.NBT.4–9, 3.NBT.1–2 | numbers are bundles of bundles; combine bundle-by-bundle |
| **C. Multiplicative Reasoning** | 2.OA.3–4, 3.OA.1–9, 3.NBT.3, 3.MD.5–7 | equal groups, arrays, and the area they tile |
| **D. Measurement & Length** | 2.MD.1–6 | a length is counted in units; the unit's size changes the count |
| **E. Fractions** | 2.G.3, 3.NF.1–3 | a fraction is a fair share of one whole, located on a line |
| **F. Geometry & Shape** | 2.G.1–2, 3.G.1–2, 3.MD.8 | shapes are defined by what's true of *all* of their sides/angles |
| **G. Data & Graphs** | 2.MD.9–10, 3.MD.3–4 | a picture of counts you can compare and act on |
| **H. Time & Money** | 2.MD.7–8 | reading a scale (clock face, coin value) against a known total |

Two domains are deliberately **cross-cutting**, not their own strand:
- **Estimation / number sense** (implicit in nearly every standard, explicit
  in 3.OA.8's "assess reasonableness," 3.NBT.1's rounding) is a *quality
  bar* applied to every strand, not a node of its own — see §4.
- **Word-problem framing** (2.OA.1, 3.OA.3, 3.OA.8) is not a node either —
  it's the *default shape* every Challenge-channel task takes (MATH_PLAN §4.4).

---

## 3. Strand detail

### A. Quantity & Counting
*The floor everything else stands on. Mostly Rung 1–2.*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `count.compare` | (pre-standard; readiness for 2.OA) | more / less / same, by matching one-to-one, no counting required | — | ">, <, = as symbols to memorize" |
| `count.subitize-5` | readiness for 2.OA.3–4 | small groups (1–4) are *seen*, not counted | `count.compare` | counting one-by-one as the only method |
| `count.skip-5-10-100` | 2.NBT.3 | counting by fives/tens/hundreds is *faster counting*, same idea as counting by ones | `count.subitize-5` | the skip-count sequence memorized as a chant divorced from what it counts |
| `count.odd-even` | 2.OA.3 | a group splits into two equal rows, or it doesn't — that's what odd/even *means* | `count.subitize-5` | "even = ends in 0,2,4,6,8" as a lookup rule |
| `count.equal-groups-array` | 2.OA.4 | objects arranged in rows and columns can be added group-by-group | `count.skip-5-10-100` | the formula `rows × cols` before the array is ever *built* |
| `place.hundreds-bundle` | 2.NBT.1 | 100 is literally ten bundles of ten — build it, don't recite it | `count.skip-5-10-100` | "the hundreds place" as an abstract column before bundles are built |
| `place.compose-hundreds` | 2.NBT.1a–b | a new hundred is what you get when ten tens are gathered — the *same* idea as ten ones making a ten | `place.hundreds-bundle` | memorizing that 100, 200, 300… "are" hundreds without building any |
| `place.read-write-1000` | 2.NBT.3 | a number's spoken name, its digits, and its bundles-of-ten-bundles-of-ten are three views of the same pile | `place.compose-hundreds` | reading digits left-to-right as a place-name recitation drill |
| `place.compare-3digit` | 2.NBT.4 | compare piles bundle-size first (hundreds beat tens beat ones), same logic as comparing any two piles | `place.read-write-1000` | the `>` / `<` symbol trick ("the alligator eats the bigger number") |

### B. Place Value & Multi-digit Arithmetic
*Rung 2–3, the backbone of the in-game economy (stock counts, build costs).*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `add.fluent-20` | 2.OA.2 | small sums are known by feel (doubles, make-a-ten), not counted on fingers | `count.subitize-5` | flashcard memorization detached from strategy |
| `add.fluent-100` | 2.NBT.5 | combine tens with tens and ones with ones, regroup only when ones overflow past ten | `add.fluent-20`, `place.hundreds-bundle` | the carrying algorithm taught as steps ("write the 1, carry the 1") before regrouping is *felt* physically with bundles |
| `add.four-2digit` | 2.NBT.6 | adding several piles is the same combine-by-bundle idea, just more piles at once | `add.fluent-100` | column-addition drill |
| `add.within-1000` | 2.NBT.7–8 | the bundle-combining idea scales straight up to hundreds; mentally add/subtract 10 or 100 the same way you'd add/subtract 1 | `add.fluent-100`, `place.compose-hundreds` | the standard algorithm as the *only* accepted method — multiple concrete strategies must remain valid |
| `add.explain-strategy` | 2.NBT.9 | you can point to *why* a strategy works using the bundles, not just that it works | `add.within-1000` | reciting a rule instead of showing the regrouping |
| `round.nearest-10-100` | 3.NBT.1 | rounding is "which bundle-mark is this pile closer to," felt on a number line, not a digit rule | `place.compare-3digit` | "look at the next digit, 5-or-more rounds up" as a memorized rule with no number line |
| `add.fluent-1000` | 3.NBT.2 | the same combine-by-bundle idea, now fast and reliable at three digits | `add.within-1000`, `round.nearest-10-100` | drilling the algorithm in isolation from the place-value reasoning that justifies it |
| `mult.by-10s` | 3.NBT.3 | multiplying by a multiple of ten is "that many groups of a ten-bundle," not a "move the zero" trick | `place.hundreds-bundle`, `mult.repeated-groups` | the zero-shortcut taught before the grouping reasoning |

### C. Multiplicative Reasoning
*Rung 2 (foundations) through Rung 4 (area). The strand with the most gameplay surface area — yield, crafting, building.*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `mult.equal-groups-total` | 2.OA.4 | the *total* of several same-size groups is found by adding the group size that many times | `count.equal-groups-array` | premature `×` notation without a concrete group in front of the player |
| `mult.repeated-groups` | 3.OA.1 | `5 × 7` *is* "5 groups of 7 things," nothing more abstract than that | `mult.equal-groups-total` | memorizing `5 × 7 = 35` without ever building 5 groups of 7 |
| `div.fair-share` | 3.OA.2 | dividing is splitting a pile into equal shares (or finding how many equal shares of a given size fit) — two questions, one action | `mult.repeated-groups` | division as "the opposite of multiplication" stated abstractly before it's *acted out* as sharing |
| `mult.div.word-problems` | 3.OA.3 | the array/group picture in your head answers "how many total / how many groups / how big is each group" | `mult.repeated-groups`, `div.fair-share` | keyword-spotting ("of" means multiply) instead of picturing groups |
| `mult.unknown-factor` | 3.OA.4, 3.OA.6 | division *is* "what times this gives that" — the same fact, looked at from the other side | `div.fair-share` | fact-family triangles memorized as a shape rather than felt as one relationship |
| `mult.properties-felt` | 3.OA.5 | groups can be flipped (rows↔columns), split, or reordered and the total doesn't change — *show* it with blocks, never name "commutative/associative/distributive" to the player | `mult.repeated-groups` | naming the properties; testing recall of property names |
| `mult.fluent-100` | 3.OA.7 | small products become known by feel the way small sums did, via the *same* strategies (doubling, groups of 10, skip-counting), not a memorized table | `mult.properties-felt`, `mult.unknown-factor` | times-table drilling / flashcards with no strategy attached |
| `mult.two-step` | 3.OA.8 | some real tasks need two connected steps (find a total, then compare or split it); estimate the answer's *size* before computing it precisely | `mult.fluent-100`, `add.fluent-1000` | teaching "look for two operations" as a procedural checklist |
| `mult.patterns` | 3.OA.9 | multiplying by the same number over and over makes a noticeable pattern (e.g., products of 4 are always even) — *notice* it, then explain it with groups | `mult.fluent-100` | memorized pattern rules with no explanation in groups |
| `area.tiling` | 3.MD.5–6 | area is "how many unit squares cover this, with no gaps or overlaps" — literally count the tiles first | `count.equal-groups-array` | the area *formula* introduced before a single shape has been tiled by hand |
| `area.as-multiplication` | 3.MD.7a–b | tiling a rectangle in rows *is* the array from `mult.repeated-groups` — side lengths multiply because rows-of-columns is groups-of-groups | `area.tiling`, `mult.repeated-groups` | `length × width` handed over as a formula with no tiling shown first |
| `area.distributive-model` | 3.MD.7c–d | splitting a rectangle into two pieces and adding their areas is the *same move* as splitting a multiplication problem into two easier ones | `area.as-multiplication`, `mult.properties-felt` | the distributive property as an algebraic identity rather than a picture of a split rectangle |
| `perimeter.vs-area` | 3.MD.8 | walking the *edge* (perimeter) and covering the *inside* (area) are different questions about the same shape — two shapes can tie on one and differ on the other | `area.tiling`, `geo.attributes` | a perimeter formula memorized without ever noticing two different-area shapes can share a perimeter |

### D. Measurement & Length
*Rung 3. Already partially live in-game via the Range Rod (see `IMPLEMENTATION_PLAN.md` Slice 1).*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `len.select-tool` | 2.MD.1 | different jobs want different tools (a short gap: pace it off; a long ridge: something with reach) | `count.subitize-5` | naming ruler/tape/yardstick as vocabulary without ever picking between them for a task |
| `len.unit-size-matters` | 2.MD.2 | measure the *same* thing with a bigger and a smaller unit — the count changes, the length doesn't | `len.select-tool` | "smaller unit = bigger number" as a memorized rule instead of a felt comparison |
| `len.estimate` | 2.MD.3 | eyeball a length in a familiar unit before measuring it — the estimate doesn't need to be exact, just in the right neighborhood | `len.unit-size-matters` | precision demanded on first guess; punishing "close" estimates |
| `len.difference` | 2.MD.4 | "how much longer" is the gap between two measured lengths, found by matching them up (or subtracting) | `len.estimate` | subtraction procedure taught divorced from the two physical lengths being compared |
| `len.word-problems` | 2.MD.5 | lengths add and subtract exactly like any other quantities — a length problem *is* an addition/subtraction problem wearing a ruler | `len.difference`, `add.fluent-100` | treating length word problems as a separate skill from number word problems |
| `len.number-line` | 2.MD.6 | a number line *is* a ruler with the units already marked — sums and differences are hops along it | `len.word-problems` | the number line introduced as an abstract diagram before it's tied to an actual measured length |

### E. Fractions
*Rung 4. Starts in Grade 2 geometry (2.G.3) as "fair shares," becomes numbers on a line in Grade 3.*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `frac.equal-shares` | 2.G.3 | splitting one whole into equal-size shares — same whole, different-*looking* shapes of share are still fair if the amounts match | `area.tiling` (readiness, not hard prereq) | "halves/thirds/fourths" as vocabulary to recite without ever splitting something by hand |
| `frac.unit-fraction` | 3.NF.1 | `1/b` is *one* of `b` equal shares of a whole — the denominator counts how many shares the whole was cut into | `frac.equal-shares` | the fraction bar read as "top number over bottom number" with no whole in view |
| `frac.build-from-unit` | 3.NF.1 | `a/b` is just `a` copies of that same `1/b` share — fractions are *built*, the same way whole numbers are built from ones | `frac.unit-fraction` | fractions as an isolated new number system unconnected to counting |
| `frac.number-line` | 3.NF.2a–b | a fraction is a *point* found by marking off equal hops from 0, exactly like whole numbers were hops on `len.number-line` | `frac.build-from-unit`, `len.number-line` | plotting fractions by a memorized rule instead of by hopping |
| `frac.equivalence` | 3.NF.3a–c | two fractions can land on the *same point* even with different numbers — same reasoning as `len.unit-size-matters` (different-size units, same length) | `frac.number-line` | cross-multiplication or a "multiply top and bottom by the same number" rule taught before a single equivalence is *seen* on the line |
| `frac.compare-same-num-denom` | 3.NF.3d | with the same denominator, more copies of a share is more; with the same numerator, a bigger share (smaller denominator) is more — both reasoned from the shares, never memorized as opposite rules | `frac.equivalence` | "bigger denominator means smaller fraction" as an abstract rule with no shares shown |

### F. Geometry & Shape
*Rung 2 (attributes) through Rung 4 (partition/area interplay).*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `geo.attributes` | 2.G.1 | a shape is defined by what's *true of it* (how many sides, how many equal-length sides, how many angles) — draw one that satisfies a rule | `count.subitize-5` | memorized shape-name flashcards with no attribute reasoning |
| `geo.rows-columns` | 2.G.2 | partitioning a rectangle into a grid and counting the cells *is* the array from `count.equal-groups-array`, applied to a shape | `geo.attributes`, `count.equal-groups-array` | the total handed over instead of counted from the grid |
| `geo.categories` | 3.G.1 | shapes nest into bigger families by shared attributes (all rhombuses and rectangles are quadrilaterals *because* they share "four sides") | `geo.attributes` | a memorized shape hierarchy chart with no shared-attribute reasoning |
| `geo.partition-equal-area` | 3.G.2 | cutting a shape into equal-area parts (not necessarily equal-*looking* parts) and naming each part's fraction of the whole | `geo.rows-columns`, `frac.unit-fraction` | assuming equal-looking = equal-area, or vice versa, without checking by tiling |

### G. Data & Graphs
*Cross-cutting; mostly Rung 3–5 because reading a graph to answer a question is an act of interpretation, not counting.*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `data.line-plot` | 2.MD.9 | repeated measurements, stacked above their value on a line — the *shape* of the stack tells a story before any number does | `count.subitize-5` | plotting as a rote data-entry task disconnected from the measurements that made it |
| `data.picture-bar-graph` | 2.MD.10, 3.MD.3 | a bar's height (or a stack of pictures) *is* a count you can compare at a glance, then check exactly | `data.line-plot`, `count.skip-5-10-100` | reading a graph as "find the number and subtract" without first eyeballing which bar looks bigger |
| `data.line-plot-fractional` | 3.MD.4 | the same line-plot idea, now the marks are halves/quarters instead of whole units — the reasoning doesn't change, only the ruler does | `data.line-plot`, `frac.unit-fraction` | treating fractional line plots as a new skill rather than the same one with finer units |

### H. Time & Money
*Rung 3. Two independent "read a scale against a known total" skills.*

| id | CCSS | Intuition | Prereqs | Avoid teaching as |
|---|---|---|---|---|
| `time.tell-5min` | 2.MD.7 | the clock is two hands sweeping at different, related speeds — read the *position*, don't count minute-marks one by one once five-minute jumps feel natural | `count.skip-5-10-100` | digital-only reading that skips the analog reasoning entirely |
| `money.coin-value` | 2.MD.8 | each coin is worth a felt *amount*, and a handful of coins totals by adding those amounts — same combining idea as any other quantity | `count.skip-5-10-100`, `add.fluent-100` | memorized coin-name-to-value lookup with no totaling practice |

---

## 4. The estimation quality bar (cross-cutting)

Every strand carries an implicit second axis: **is the player's answer a
reasonable estimate, or an exact count, or neither?** Per `MATH_PLAN §1` rule
2, an estimate is not a lesser answer — it is often the *target* answer. The
adaptive engine (see `DEV_HANDOFF.md` §5) should track, per node, whether the
player's typical response is:

1. **No sense of scale** (wildly off; needs Rung-appropriate re-teaching).
2. **Reasonable range** (the number-sense target — always sufficient for
   Environmental/Social channel tasks).
3. **Exact** (fine when it happens naturally; never *required* below Rung 4).

This is the operational form of 3.OA.8's "assess the reasonableness of
answers" and 3.NBT.1's rounding — both are really this same quality bar
applied at different points in the graph.

---

## 5. Rung mapping (bridges to `MATH_PLAN.md §3`)

`MATH_PLAN.md`'s ladder is the *shape* of progression; this table is its
*content*. A node's rung is a starting estimate for the adaptive engine, not
a hard gate — see `MATH_PLAN §5`.

| Rung | Strand A | Strand B | Strand C | Strand D | Strand E | Strand F | Strand G | Strand H |
|---|---|---|---|---|---|---|---|---|
| 1 | `count.compare` | — | — | — | — | — | — | — |
| 2 | `count.subitize-5`, `count.skip-5-10-100`, `count.odd-even`, `count.equal-groups-array`, `place.hundreds-bundle`, `place.compose-hundreds` | `add.fluent-20` | `mult.equal-groups-total` | `len.select-tool` | — | `geo.attributes` | `data.line-plot` | — |
| 3 | `place.read-write-1000`, `place.compare-3digit` | `add.fluent-100`, `add.four-2digit`, `add.within-1000`, `add.explain-strategy` | `mult.repeated-groups`, `div.fair-share`, `mult.div.word-problems`, `mult.unknown-factor`, `mult.properties-felt`, `mult.fluent-100` | `len.unit-size-matters`, `len.estimate`, `len.difference`, `len.word-problems` | — | `geo.rows-columns` | `data.picture-bar-graph` | `time.tell-5min`, `money.coin-value` |
| 4 | — | `round.nearest-10-100`, `add.fluent-1000`, `mult.by-10s` | `area.tiling`, `area.as-multiplication`, `area.distributive-model`, `perimeter.vs-area` | `len.number-line` | `frac.equal-shares`, `frac.unit-fraction`, `frac.build-from-unit`, `frac.number-line` | `geo.categories`, `geo.partition-equal-area` | — | — |
| 5 | — | — | `mult.two-step`, `mult.patterns` | — | `frac.equivalence`, `frac.compare-same-num-denom` | — | `data.line-plot-fractional` | — |

**Reading the gaps:** a strand with no entry at a rung isn't behind — it
simply has no standard at that level of abstraction (e.g., Time & Money is
entirely Rung 3; there's no Grade 2/3 standard that pushes it further).

---

## 6. Total inventory

- 8 strands, 46 skill nodes, covering every standard in the prompt's Grade 2
  and Grade 3 excerpt (2.OA.1–4, 2.NBT.1–9, 2.MD.1–10, 2.G.1–3, 3.OA.1–9,
  3.NBT.1–3, 3.NF.1–3, 3.MD.1–8, 3.G.1–2), except the two cross-cutting axes
  called out in §2 (estimation quality, word-problem framing), which apply
  to all nodes rather than being nodes themselves, and 3.MD.1–2 (time
  intervals to the minute, liquid volume/mass in grams/kg/liters), which are
  **descoped** — see `DEV_HANDOFF.md §1` for why and where they'd slot in
  (they extend Strand H and would sit alongside Strand D respectively) if
  picked up later.
- This is the seed data for the adaptive engine's skill graph
  (`DEV_HANDOFF.md §5`) and the standard the concealment audit
  (`MATH_PLAN.md §8`, `IMPLEMENTATION_PLAN.md` Slice 8) checks every piece of
  in-game content against: **if a task can't name its node id and intuition
  from this table, it doesn't ship.**
