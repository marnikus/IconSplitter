# RULE 16 — code-quality gates

Canonical RULE 16 text. Return to the [RULE 1–25 index](../AGENT_RULES.md) or [other quality rules](QUALITY.md).

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
| Line coverage of `src/lib/` | **≥ 80%**, never decrease vs baseline | `vitest --coverage` (Istanbul; V8 audit) |
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

1. **Understand the problem fully.** Read the task's read pack in `docs/current/README.md` and the rules it touches before editing.
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
[ ] owning current pages + router row updated if behaviour/docs moved
```
