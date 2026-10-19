# Quality and verification rules

Canonical rules for this topic. Return to the [RULE 1–24 index](../AGENT_RULES.md) for the other rules.

<a id="rule-8"></a>

## RULE 8 — Tests execute the real thing

Tests run the real `detect` / `render` logic against small synthetic images (canvas/image stubs where the browser APIs are unavoidable) — not mocks of `analyze`/`detect` and not assertions on UI strings. If a test would pass with the feature deleted, it is not a test. Assertions must check observable behaviour: box count, box coords, output dimensions, blob type.

<a id="rule-16"></a>

## RULE 16 — Code-quality gates on every production change

Mandatory for every change to production code in `src/`. Thresholds are frozen, inherited from PIA RULE 16; only the tooling is adapted to TypeScript.

Executable form: `tools/quality.mjs` (run it; do not re-derive). Baseline:
`tools/quality_baseline.json`. Full verification workflow:
[`CODE_VERIFICATION.md`](../CODE_VERIFICATION.md) — **must be run before every
push** (`npm run verify`).

### 16.0 When this applies

| Situation | Gate |
|---|---|
| New function/component in `src/` | **Hard fail** if any threshold in §16.1–§16.2 exceeded |
| Edit of existing function that already violates a threshold (legacy) | Must not **worsen** the metric; prefer reduce (§16.5) |
| Tests, build config (`vite.config.ts`), docs | Out of scope for size/CC (tests must still exist for new production paths) |
| Generated/inline string payloads (long SVG/CSS literals) | Length of a single string literal does not force a split; surrounding logic still CC ≤ 10, nesting ≤ 4 |

### 16.1 Size and volume — hard limits on **new** code

| Check | Prefer | **Fail if** |
|---|---:|---:|
| Function / component body lines | ≤ 20 | **> 30** |
| File / class lines | ≤ 120 (file ideal 150–300, §18.2) | class **> 150** |
| Parameters per function | ≤ 3 | **> 4** |
| Direct methods per class / hooks per component | ≤ 10 | **> 15** |

**16.1.1 When approaching limit**

1. **Do not** split a function into `fooPart1`/`fooPart2` solely to game line count. Extraction allowed only when the helper's name states a real responsibility (`chooseAutoRadius`, `orderBoxesByReading`).
2. **Do not** hide parameters behind a catch-all `options: any`. Grouping into a named domain type (`ExportOpts`, `SquareInfo`) is allowed; an options bag that exists only to dodge the param cap is not.
3. A component past 15 hooks must be split into collaborating components **before** hook 16.

### 16.2 Complexity — block merge if exceeded on new code

| Check | Tool | **Fail if** | Counting rules |
|---|---|---:|---|
| Cyclomatic complexity | `eslint` `complexity` rule | **> 10** | base 1; +1 per `if` / `?:` / loop / `case` / `catch` / `&&` / `??` decision point |
| Nesting depth | review / eslint `max-depth` | **> 4** | max ancestry of `if`/loops/`try`; `else if` counts as nested; sibling blocks do not add |
| Cognitive complexity | review | **> 15** | nested structures cost extra; named predicates preferred |

**Anti-gaming (non-negotiable).** Forbidden: one-line helpers that only re-host the original body; lookup tables of lambdas whose only purpose is to hide `if` count; deleting real decision branches to reach a number. Allowed: deleting dead branches; extracting a helper that already exists as a named concept in the domain; replacing wide `catch (e)` + runtime type checks with narrow handling.

Floor example: four independent binary outcomes cannot cost less than CC 5. Do not lower CC by deleting a real decision.

### 16.3 Test coverage — new code must be tested

| Metric | Target | Tool |
|---|---:|---|
| Line coverage of `src/lib/` | **≥ 80%**, never decrease vs baseline | `vitest --coverage` (v8) |
| Uncovered **new** functions | **0** without override | coverage diff |

**What "tested" means.** For every new production function: at least one test that would **fail if the function were deleted** or a boolean inverted; empty vs broken distinguished (RULE 4); batch loops tested for per-item failure isolation (RULE 5).

### 16.4 Smells and override mechanism

| Smell | Action |
|---|---|
| Duplicated logic (copy-pasted canvas/box math) | Extract named helper in the owning layer |
| Dead code (unused exports/imports/vars) | Remove (`tsc --noEmit` + lint must stay clean) |
| Long function / god component | Split by responsibility, not line quota |

Zero **new** smells on diff. Pre-existing smells are inventory, not licence to add more.

Override comment format (rare):

```ts
function wideLegacyExport(img: A, an: B, boxes: C, sq: D, opts: E, maxOut: number) {
  // quality-override: params=6 reason=renderIcon signature is a frozen contract used by all three export paths
}
```

Strict format: `quality-override: <metric>=<value> reason=<constraint, ≥20 chars>`. Reason must name a **constraint** (frozen contract, single string payload, browser API shape), not "faster to ship".

### 16.5 Legacy code (already over the line)

Baseline at adoption (2026-09-30): `src/App.tsx` = 598 lines, `src/lib/detect.ts` = 306 lines. These are **legacy hotspots**: you must not increase their line count, complexity, or hook count without netting down elsewhere; touch them only with tests that lock current behaviour first, and extract by domain concept on touch (`chooseAutoRadius`, export-path split, sheet panel components).

### 16.6 Agent workflow

1. **Understand the problem fully.** Read `SYSTEM_OF_RECORD.md` and rules 1–15 + 20–24 before editing.
2. **Design in a doc first** when a change moves complexity across files — into `docs/archive/<YYYY-MM-DD>-<topic>/` (RULE 17).
3. **Tests first** for behaviour changes (RULE 8); refactors run the existing suite as an equivalence gate.
4. **Measure** before claiming done: `npx tsc --noEmit`, lint, `vitest` (once present).
5. **Update current docs** in the same change (RULE 17).

### 16.7 Acceptance checklist (self-review before claiming done)

```text
[ ] No new function/component >30 lines (except documented string-literal payloads)
[ ] No new file >300 lines without split-by-responsibility reason
[ ] No new function with >4 params (domain types for grouping are fine)
[ ] CC ≤10, nesting ≤4 on every new/edited function
[ ] tsc --noEmit and lint clean
[ ] every new lib function has a test that would fail if deleted
[ ] no new duplication; no dead code left behind
[ ] did not game metrics with dummy helpers
[ ] new code aims at RULE 18 ideals; every deviation carries ideal-size: reason
[ ] remediation followed RULE 19 order (nesting → CC → cognitive → size last)
[ ] SYSTEM_OF_RECORD.md + docs/README.md updated if behaviour/docs moved
```

<a id="rule-18"></a>

## RULE 18 — Ideal sizes: write for the reader's context budget

> **Preferences, not fail lines.** Only RULE 16 thresholds fail a change.

| Element | Ideal size | Sweet spot |
|---|---|---:|
| Function / component body | **4–20 lines** | ~8–12 |
| Single file | **150–300 lines** | ~200 |
| Module (one directory) | **5–15 cohesive files** | 7–10 |
| Context file (`docs/current/*`) | **60–200 lines** | ~120 |

* Under 4 lines is fine when the name earns its place (domain predicate, required hook); not fine when the body is one call re-hosted under a meaningless name (§16.2 gaming).
* Over 20 lines usually means a second responsibility hiding inside the first — get back down via RULE 19.
* One **primary responsibility** per file, and a header comment saying what the file owns (`detect.ts` owns mask + boxes; `render.ts` owns output pixels).
* Cohesion test for directories: files that never change in the same commit belong in different directories.
* Over ideal is allowed **with visible reason**:

```ts
// ideal-size: 78 lines reason=single scanline loop over one mask; splitting would break locality
```

<a id="rule-19"></a>

## RULE 19 — Fix complexity before size (remediation order)

> When code is over the line, fix in this order: **nesting → cyclomatic → cognitive → size.** Size is the symptom; the other three are the cause.

**Step 1 — nesting (>4 → flatten).** Guard clauses: `if (!ok) return;` early so the happy path never indents. Invert conditions. Extract the innermost deep block first.

**Step 2 — cyclomatic (>10 → simplify).** Lookup tables instead of `if/else` chains (tables are data, not branches); strategies for interchangeable behaviour. Never delete a real decision to reach the number.

**Step 3 — cognitive (>15 → clarify).** Name the compound: a called predicate (`isStableIconCount`) reads better than `a && !b && c || d` inline. Obvious beats clever.

**Step 4 — size, last; usually already fixed.** If not, extract **by concept** with a name that already exists in the domain — never `fooPart1`. Too many params get a parameter object.

Verify after every step: the existing suite must stay green, because steps 1–3 must be behaviour-preserving.

<a id="rule-21"></a>

## RULE 21 — Selector priority: semantic > structural > class fragment

Applies to tests, and to any DOM query the app itself makes:

1. **Semantic**: `getByRole`, `getByLabelText`, visible text, `aria-*`
2. **Structural**: parent/child relationships, `:has(...)`
3. **Class fragment** (last resort): Tailwind utility classes — only with verification and fallback

Never depend on generated ids or on long Tailwind class chains as the primary handle.
