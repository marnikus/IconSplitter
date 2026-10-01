# Agent Rules — Icon Splitter

What an AI agent (or a human) **MUST** follow when adding or changing code here.
This file is the **detailed code-quality rules** for Icon Splitter, adapted from
`Process-Images-in-Areana/docs/current/AGENT_RULES.md` (24 rules) to this
React + Vite + TypeScript browser app.

<!-- ideal-size: ~335 lines reason=the stable 24-rule policy, workflow and acceptance checklist remain one discoverable reference; per-feature behaviour and design stay in System-of-Record/archive. -->

* Current behaviour, invariants and flows: [`SYSTEM_OF_RECORD.md`](SYSTEM_OF_RECORD.md)
* Verification workflow before every push: [`CODE_VERIFICATION.md`](CODE_VERIFICATION.md)
* Living UI handle reference: [`UI_SELECTORS.md`](UI_SELECTORS.md)
* Dated quality re-check records: [`QUALITY_RECHECK.md`](QUALITY_RECHECK.md)
* Doc map (what is current vs historical): [`../README.md`](../README.md)
* Rule numbers are **stable** — never renumber; append instead.

| # | Rule | Kind | Adapted from |
|---|---|---|---|
| 1 | All pixel math goes through `src/lib/` — no hand-rolled canvas logic in the UI | behaviour | PIA RULE 1 — shared visual runner |
| 2 | Report every step through the toast/status surface | behaviour | PIA RULE 2 — engine.report() |
| 3 | Detection and rendering are pure functions of explicit inputs | behaviour | PIA RULE 3 — plain settings |
| 4 | Distinguish "empty" from "broken" | behaviour | PIA RULE 4 |
| 5 | Batch export reports progress incrementally | behaviour | PIA RULE 5 |
| 6 | Excluded / removed items must not persist into output | data | PIA RULE 6 — filtered entities |
| 7 | Interruption must be honoured by every long-running loop | behaviour | PIA RULE 7 — stop gates |
| 8 | Tests execute the real thing | testing | PIA RULE 8 |
| 9 | A disabled option must not stall the pipeline | behaviour | PIA RULE 9 |
| 10 | One control per decision | behaviour | PIA RULE 10 |
| 11 | Excluding an icon must not destroy detection work | behaviour | PIA RULE 11 |
| 12 | If undo is ever added: one global timeline | data | PIA RULE 12 |
| 13 | Never persist state you cannot read back | data | PIA RULE 13 |
| 14 | The export is not the sheet | data | PIA RULE 14 |
| 15 | Nothing is exported without the verification gate | data | PIA RULE 15 — two-step gate |
| 16 | Code-quality gates on every production change | quality | PIA RULE 16 (TS tools) |
| 17 | One current doc, dated archive | docs | PIA RULE 17 |
| 18 | Ideal sizes: write for the reader's context budget | quality | PIA RULE 18 |
| 19 | Fix complexity before size (nesting → CC → cognitive → size) | quality | PIA RULE 19 |
| 20 | Privacy & compliance: local by default; explicit Requesty opt-in | compliance | PIA RULE 20 — ToS adapted |
| 21 | Selector priority: semantic > structural > class fragment | quality | PIA RULE 21 |
| 22 | Export output must be traceable to its source | data | PIA RULE 22 — correlation token |
| 23 | Delivery is atomic; never a partial file | data | PIA RULE 23 — atomic save |
| 24 | LIVE SYNC: the UI mirrors the stored value at the moment of change | behaviour | PIA RULE 24 |

---

## RULE 1 — All pixel math goes through `src/lib/`

> **Any code that reads image pixels, builds masks, computes boxes, or draws onto a canvas MUST live in `src/lib/detect.ts` / `src/lib/render.ts`. The UI (`App.tsx`) orchestrates; it never hand-rolls `getImageData` / `drawImage` math inline.**

The lib is the single place that implements the pipeline phases:

| Phase | Owner | Contract |
|---|---|---|
| **ANALYZE** | `analyze(img)` → `Analysis` | background colour, ink mask, threshold |
| **DETECT** | `detect(a, radiusFrac)` → `DetectResult` | boxes in natural-image coords, reading order |
| **RENDER** | `squareInfo` / `cropRect` / `renderIcon` | square output canvas per icon |
| **DELIVER** | `canvasToBlob` + zip/folder/clipboard in App | bytes leave only as finished blobs |

Why centralised: fixing detection/quality happens in exactly one place; the UI stays a thin, testable orchestrator; lib functions stay pure and unit-testable (RULE 8).

## RULE 2 — Report every step through the toast/status surface

Every meaningful step of a user-visible operation reports via `say()` (toast) and the `busy` state. A step that fails silently is a bug — always say why ("Could not read image", "No icons to export", "Clipboard is blocked by the browser — use Download instead"). Errors are reported distinctly from success (`err: true`), never swallowed by an empty `catch {}`.

## RULE 3 — Detection and rendering are pure functions of explicit inputs

`analyze`, `detect`, `squareInfo`, `cropRect`, `renderIcon` take everything they need as parameters and read no module-level mutable state. So:

* new pipeline functions follow the same shape — inputs in, result out;
* UI state (`padding`, `size`, `transparent`) is passed explicitly as `ExportOpts`, never read from globals inside lib;
* when a parameter list grows past §16.1, group by **domain concept** (`ExportOpts`, `Analysis`, `SquareInfo`) — never a catch-all `options: any`.

## RULE 4 — Distinguish "empty" from "broken"

An empty result must be reported distinctly from failure:

* no sheets loaded (empty state UI) vs. file is not an image ("Please choose image files…") vs. image failed to decode ("Could not read image");
* sheet loaded but 0 icons detected (honest empty result, user can adjust merge radius) vs. detection throwing (error);
* export with all icons excluded ("No icons to export") vs. export failing mid-way ("Export failed").

Never let a no-op path end with a success-looking toast.

## RULE 5 — Batch export reports progress incrementally

Anything that loops over many items (multi-sheet ZIP export, folder-save loop) must surface progress **as it happens** (`busy` message per item), not one batch message at the end.

Two matching requirements:

* a per-item failure must not kill the whole batch — catch, report the item, continue;
* yielding between items (`await sleep()`) keeps the UI responsive; never block the main thread for a whole batch.

## RULE 6 — Excluded / removed items must not persist into output

* Excluded boxes (`excluded`) never appear in ZIP, folder save or clipboard output.
* A removed sheet never reappears in any later export, and its object URL is revoked.
* Re-detection with a stricter merge radius must shrink the icon list, never resurrect removed items.

Invariant: *every export contains exactly the currently included boxes of currently loaded sheets.*

## RULE 7 — Interruption must be honoured by every long-running loop

Batch loops must be interruptible: the loop re-reads current state (or an abort signal) at the top of each iteration, so removing a sheet or unchecking an icon during a long export takes effect promptly, not after the loop finishes. Distinguish "interrupted" from "failed" in reporting. Inner awaits must not swallow cancellation.

## RULE 8 — Tests execute the real thing

Tests run the real `detect` / `render` logic against small synthetic images (canvas/image stubs where the browser APIs are unavoidable) — not mocks of `analyze`/`detect` and not assertions on UI strings. If a test would pass with the feature deleted, it is not a test. Assertions must check observable behaviour: box count, box coords, output dimensions, blob type.

## RULE 9 — A disabled option must not stall the pipeline

An option that declines to do its work skips *only that work*, never the pipeline:

* `transparent` off → background fill, export proceeds; `transparent` on → skip fill only;
* a failed clipboard write fails open to the message "use Download instead", never a silent dead end;
* folder-save unsupported in this browser → steer to ZIP, don't block.

Skipping is success-with-note, never failure.

## RULE 10 — One control per decision

A setting must not duplicate a decision another setting already makes:

* merge radius lives once (per-sheet slider + auto); detection reads only that;
* output size is one control (`SIZES` select), applied once in `renderIcon`;
* padding is one slider consumed by `squareInfo` alone.

When a control is retired, remove every reader of it — a dead setting that still influences output is a bug.

## RULE 11 — Excluding an icon must not destroy detection work

Exclusion is a display/export flag, not deletion: `boxes` stays intact, `excluded` marks indices. Toggling a box back costs nothing — detection is never re-run for exclude/include, and per-box previews stay available. A mode that declines to export an item must still keep it computed.

## RULE 12 — If undo is ever added: one global timeline

There is currently no undo. If it is ever introduced, it must be **ONE** chronological timeline covering every editable surface (sheet list, exclusions, merge radius, padding/size/transparent) — one `Ctrl+Z` reverses the most recent edit regardless of which control produced it. No separate undo per panel.

## RULE 13 — Never persist state you cannot read back

Nothing is persisted today. If persistence is ever added (localStorage, IndexedDB, presets): validate on read (version, shape, numeric sanity), **REJECT** corrupt payloads and fall back to defaults — never crash the app on startup. A bad payload must cost one ignored load, never a bricked app. Atomic writes where the API allows.

## RULE 14 — The export is not the sheet

* The loaded sheet (source image, analysis, boxes) answers "what is detected".
* The exported files answer "what the user saved" and live outside the app.
* Removing a sheet, re-detecting, or excluding icons never deletes or invalidates already-downloaded files. Only explicit user action in the OS removes exports.

## RULE 15 — Nothing is exported without the verification gate

An icon may be delivered to the user (ZIP entry, folder file, clipboard) **only** when all checks pass:

1. `renderIcon` produced a canvas with `width > 0` and `height > 0`;
2. `canvasToBlob` returned a non-null blob of the requested type with `size > 0`;
3. the crop belongs to a currently included box of a currently loaded sheet (RULE 6).

Verification lives in the export path and fails **closed**: any failed check → the item is skipped with an honest error message (RULE 4), never a zero-byte or corrupt file.

## RULE 16 — Code-quality gates on every production change

Mandatory for every change to production code in `src/`. Thresholds are frozen, inherited from PIA RULE 16; only the tooling is adapted to TypeScript.

Executable form: `tools/quality.mjs` (run it; do not re-derive). Baseline:
`tools/quality_baseline.json`. Full verification workflow:
[`CODE_VERIFICATION.md`](CODE_VERIFICATION.md) — **must be run before every
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

## RULE 17 — One current doc, dated archive

* `docs/current/` holds only what is true today — `SYSTEM_OF_RECORD.md`, `AGENT_RULES.md`. If not true today it does not belong here.
* Every design/plan/root-cause doc goes straight into `docs/archive/<YYYY-MM-DD>-<topic>/`, dated by day written. Archived docs are never edited to "catch up".
* **Do not add a new top-level doc for a feature.** Write the design into the archive, then update the rows of `SYSTEM_OF_RECORD.md` it affects and the map in `docs/README.md`.
* Reference docs by full repo-relative path on one line so they stay greppable.
* A doc that no longer describes reality gets folded into `SYSTEM_OF_RECORD.md` or replaced by a one-line pointer — never deleted, because reasoning is value.

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

## RULE 19 — Fix complexity before size (remediation order)

> When code is over the line, fix in this order: **nesting → cyclomatic → cognitive → size.** Size is the symptom; the other three are the cause.

**Step 1 — nesting (>4 → flatten).** Guard clauses: `if (!ok) return;` early so the happy path never indents. Invert conditions. Extract the innermost deep block first.

**Step 2 — cyclomatic (>10 → simplify).** Lookup tables instead of `if/else` chains (tables are data, not branches); strategies for interchangeable behaviour. Never delete a real decision to reach the number.

**Step 3 — cognitive (>15 → clarify).** Name the compound: a called predicate (`isStableIconCount`) reads better than `a && !b && c || d` inline. Obvious beats clever.

**Step 4 — size, last; usually already fixed.** If not, extract **by concept** with a name that already exists in the domain — never `fooPart1`. Too many params get a parameter object.

Verify after every step: the existing suite must stay green, because steps 1–3 must be behaviour-preserving.

## RULE 20 — Privacy & compliance: local by default, explicit Requesty opt-in

* Existing sheet, Batch and Selection workflows process files locally. They make no content-bearing network calls or analytics, and remain available offline in the single-file build.
* **Generate SVG is the explicit user-requested exception:** it sends only Selection-approved AI-image contact sheets, their filename/path/position manifest, and the displayed prompt to the fixed Requesty router, and only after the user reviews the pre-send plan and chooses **Generate now**. Scanning, filtering, opening a row and local preflight do not upload content.
* Never send originals, exports, or unapproved images. Do not add other content-bearing endpoints or analytics; the API key is sent only as the Requesty Bearer header and is excluded from preferences, history, sidecars, UI disclosures and logs.
* Respect copyright: the user is responsible for owning the sheets they process; the app never fetches images from URLs the user has not provided.
* Object URLs created from user files are revoked when no longer needed.

## RULE 21 — Selector priority: semantic > structural > class fragment

Applies to tests, and to any DOM query the app itself makes:

1. **Semantic**: `getByRole`, `getByLabelText`, visible text, `aria-*`
2. **Structural**: parent/child relationships, `:has(...)`
3. **Class fragment** (last resort): Tailwind utility classes — only with verification and fallback

Never depend on generated ids or on long Tailwind class chains as the primary handle.

## RULE 22 — Export output must be traceable to its source

Adapted from the correlation-token rule:

* Every exported file is named from its sheet base name plus a deterministic index in detection order — an export must be traceable back to *which sheet, which icon*.
* The export path only consumes boxes from the sheet instance being exported; never mix boxes across sheets or from a stale pre-redetection snapshot.
* ZIP entries and folder files use the same naming function — one owner, no drift.

## RULE 23 — Delivery is atomic; never a partial file

* Blobs are complete-or-nothing: a ZIP is built fully in memory and downloaded once; a folder-save writes one finished blob per file; a partial/corrupt blob is never handed to the browser (RULE 15 gate).
* Name collisions get a unique suffix rather than silent overwrite of user files.
* Interrupted exports never leave a half-written ZIP: build first, deliver once.

## RULE 24 — LIVE SYNC: the UI mirrors the stored value at the moment of change

* Every value the user can SEE or EDIT must display the current state IMMEDIATELY when it changes — from any source: adding a sheet, re-detecting, toggling exclusion, moving a slider. No visible value may wait for a re-render triggered by something else.
* Every mutation goes through state setters with fresh derived values (`useMemo` over current state) — never a cached copy of boxes or previews that can drift from the source of truth.
* Anti-pattern (banned): "it is in state, it will show after some other interaction". If a user action needs another action to become visible, the sync is broken.
