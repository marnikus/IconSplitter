# Batch folders — split review: approve / decline / warning gate before split

Date: 2026-10-12
Area: Batch folders tab (`src/batch/`)
Status: **PLAN — no code yet.** This doc is the implementation contract; append an
"Implementation (final)" section here when the code lands (same commit, RULE 17).

Reuse source: the Generate SVG tab's review controls (`src/svg/`,
`src/lib/svgmodel.ts`, `src/lib/reviewmeta.ts`, `src/svg/SvgRow.tsx`,
`src/svg/SvgBulkBar.tsx`, `src/svg/reviewact.ts` / `reviewundo.ts`) and the
shared CSS already shipped for them (2026-10-11
`docs/archive/2026-10-11-regenerated-review-status/design.md`).

---

## 1. Requirement (from the user, 2026-10-12)

1. **Warning when an image does not split into exactly 4 icons** — yellow side
   line + warning icon, same visual language as the SVG tab's
   "Regenerated — new review".
2. **Approve / Decline status exists BEFORE the split runs.** Only approved
   images may be split into folders and processed. Declined and warning images
   are never included in the split.
3. **Auto-status from preview:** every preview that split its image into
   exactly 4 icons successfully → **approved**; every other case (≠4 icons,
   0 icons, preview error) → **warning**. The user can manually change any
   status afterwards.
4. **Reuse, don't duplicate:** all of these controls already exist in the
   Generate SVG tab — reuse that code (shared modules / extracted components),
   never a second private copy.

## 2. Decisions confirmed with the user (2026-10-12)

| Question | Decision |
|---|---|
| Which rows does the split run process? | "Split selected" becomes available **only after a split preview has finished**; preview assigns the statuses (exactly-4 → approved, else warning); then only **checked ∧ approved** rows are split. Declined / warning / still-pending rows are excluded from the run even when checked. |
| Is "exactly 4" fixed? | **No — a preset field, default 4**, remembered with the preset like padding/size (a number field next to the split settings). |
| Do decisions persist? | **Yes — in the existing per-reference `<base>.json` state files** (the same files that hold `unprocessed/processed/…` today), validated on read (RULE 13). |
| Rows never previewed? | **Pending** (neutral, like the SVG tab). Pending rows can never be split — which is exactly what keeps the split button dead until a preview ran. |

---

## 3. Research — what exists today

### 3.1 Batch tab (`src/batch/`)

* Rows (`useBatchTypes.Row`) = scanned `AiImageEntry` + `status: SourceStatus`
  (`unprocessed/processed/skipped/missing/changed/deleted`) + `selected`.
  One axis only: **processing state**, persisted in per-reference
  `<base>.json` (`src/lib/statefile.ts`, written by `src/batch/statewrite.ts`
  after every scan and after every batch run).
* Preview (`src/batch/useBatchPreview.ts`): runs the REAL detect per selected
  row (concurrency 3, abortable, LRU-cached) and lands a `PreviewEntry
  { count, thumbs, boxes, status: idle|loading|done|error }` per row; shown in
  the row's "Preview splits" cell and the virtualized `BatchPreviewPanel`.
  `previewSingle` re-previews one row immediately on merge Apply/Reset.
* Split run (`src/batch/batchOps.ts` → `src/batch/process.ts`): builds items
  from **selected** rows, splits each (`splitSheet`), writes `split_NN/…` under
  the planned tree, then `applyOutcomes` writes processing statuses back into
  `<base>.json`. Stop between items, per-item failure isolation (RULE 5/7).
* UI: `ScanTable` rows carry `svg-row batch-row {status}` classes;
  `ScanStatusCell` renders the processing badge; `BatchBulkBar` mirrors the SVG
  bar (check-all, select visible/deselect, zoom, "◉ Preview splits",
  "▶ Split selected (N)").
* Hotkeys (`useBatchHotkeys.ts`): ↑/↓ move active, E/Q check/uncheck active.
* No approve/decline/warning concept exists anywhere in the tab today.

### 3.2 Generate SVG tab — the code being reused

* `ReviewStatus = "pending" | "approved" | "declined" | "needs-review"` +
  `isReview` — defined once in `src/lib/svgmodel.ts` (parsed/validated on every
  sidecar read).
* Row controls (`src/svg/SvgRow.tsx`): per-row `✓ Approve` (`svg-btn tiny
  success`, `svg-approve-{id}`), `✕ Decline` (`svg-btn tiny danger`,
  `svg-decline-{id}`), `⚠ Needs review` (`svg-btn warning`,
  `svg-needs-review-{id}`), plus the review badge.
* Bulk controls (`src/svg/SvgBulkBar.tsx`): `✓ Approve selected` /
  `✕ Decline selected` / `⚠ Needs review selected` (`svg-approve-selected`,
  `svg-decline-selected`, `svg-needs-review-selected`), disabled when nothing
  decidable is checked.
* Semantics helper `src/lib/reviewmeta.ts`: `statusInfo(decision)` →
  `{ label, glyph, tone }` so state never relies on colour alone (a11y);
  `keyToAction(key, inField)` → `approve | decline | …` for hotkeys.
* Undo: one gesture = ONE `svgReview` history entry (`src/svg/reviewact.ts`
  → `src/state/apply.ts` case `svgReview` → `applySvgReviewPatch`); a mounted
  panel claims the apply path (`bindSvgReviewApplier`), with a file-only
  fallback when no panel is mounted (`src/svg/reviewundo.ts`).
* CSS (already in `src/index.css`, shared classes — the batch rows already use
  `svg-row` / `svg-badge` / `svg-btn`):
  * `.svg-row.approved::after` / `.declined::after` / `.needs-review::after`
    → green / red / **yellow side line** (`--v2-yellow`).
  * `.svg-badge.approved` green, `.declined` red, `.pending`/`.needs-review`
    **yellow** badge.
  * `.svg-btn.success` / `.danger` / `.warning` button colours.
  * `.svg-row.corrupt` shows the yellow inset line (`inset 3px 0 0`) — same
    technique available for batch rows.

---

## 4. Design

### 4.1 Status model — one shared definition (the no-duplicate contract)

The batch decision is the SAME concept as the SVG review decision (a human
approve/decline/"needs attention" judgement), so it gets the same type, the
same values and the same display rules:

* **Extract** `ReviewStatus` + `isReview` from `src/lib/svgmodel.ts` into a new
  tiny pure module `src/lib/reviewstatus.ts`; `svgmodel` re-exports it so every
  existing import keeps working. Batch imports the same module. One union, one
  validator — never two.
* The batch tab stores `"needs-review"` as the value and **displays it as
  "Warning"** (glyph ⚠, yellow). Rationale: the semantics of `needs-review`
  ("yellow, needs a human") are identical; only the label is tab-specific.
  This keeps the persisted JSON vocabulary identical across tabs and keeps
  `isReview` the single validator.
* Extend `src/lib/reviewmeta.ts`:
  * `statusInfo` gains the `needs-review` entry (glyph ⚠, tone `"warn"`); the
    label becomes context-aware — `statusInfo(d, label?)` or a sibling
    `batchStatusInfo` — SVG keeps "Regenerated — new review", batch shows
    "Warning". Existing callers keep their behaviour.
  * `keyToAction` gains `"warn"` (`w`/`W`) so batch hotkeys reuse the same
    mapping (SVG's `SvgHotkeys.ts` may adopt it or not — no behaviour change
    required there).

The two axes stay orthogonal and both stay visible:

| Axis | Values | Owner | Persisted in |
|---|---|---|---|
| **Review (NEW)** | pending · approved · declined · needs-review ("Warning") | the human's split gate | `<base>.json` `sources[].review` |
| Processing (existing) | unprocessed · processed · skipped · missing · changed · deleted | the pipeline's bookkeeping | `<base>.json` `sources[].status` |

A declined row keeps its processing status; a processed row keeps its review.
Neither badge replaces the other.

### 4.2 "Exactly N icons" — preset field, default 4

* `Preset` (`src/lib/presets.ts`) gains `expectedIcons: number` — **NOT** part
  of `SplitSettings` (it changes no pixels; it classifies the result).
  `defaultPreset` → `4`; `validatePreset` clamps through a new pure
  `clampExpectedIcons(v: unknown): number` (finite integer, 1–64, junk → 4)
  so RULE 13 holds for stored presets.
* UI: a small number field in `BatchMergeBar` (the split-settings row), testid
  `batch-expected-icons`, label "Expected icons", saved into the preset via the
  existing `setPreset` (same persistence class as padding/size — not undoable).
* Changing `expectedIcons` **re-classifies every row that currently has a done
  preview entry** (the cached count is already in `useBatchPreview`'s LRU /
  previews map) — pending rows stay pending, untouched rows stay as persisted.
  One undo entry for the gesture, same as a bulk decide.

### 4.3 Auto-assignment from preview (requirement 3)

* Pure classifier in a new `src/lib/batchreview.ts`:

  ```
  classifySplitCount(count: number, expected: number): "approved" | "needs-review"
  ```

  `count === expected` → `approved`; anything else (fewer, more, 0) →
  `needs-review`. A preview that **errored** also classifies as `needs-review`
  — "all other cases are added to warning" — with the error reason kept on the
  entry.
* Plumbing: `useBatchPreview` gains an optional `onEntry?: (entry, row) => void`
  called once per freshly computed `done`/`error` entry (both the batch queue
  path and `previewSingle`). BatchPanel wires it to the review hook:
  * in-memory row review updates **immediately** as each entry lands (RULE 24 —
    the badge, the yellow line and the split button react live while previews
    stream in);
  * changed classifications are collected; when the preview run finishes
    (`isPreviewing` → false) they are written to the touched `<base>.json`
    groups in ONE pass (one write per group) and pushed as **ONE undoable
    history entry** ("Preview: N approved · M warning"). A classification that
    matches the row's current review writes nothing.
  * `previewSingle` (merge Apply/Reset on one row) classifies and writes that
    row immediately — same gesture class as today's immediate preview.
* A manual decision always survives until the NEXT preview of that row
  recomputes it. Re-preview is the one gesture that overwrites manual choices —
  that is its purpose.

### 4.4 Manual decisions (requirement 2/3, SVG parity)

* **Row level:** the batch Review cell shows the badge (glyph + label) and the
  three tiny buttons via a **shared component** (see §5): ✓ approve /
  ✕ decline / ⚠ warning. Disabled for `missing`/`deleted` rows (nothing to
  judge) — same rule as the checkboxes. Clicking writes through immediately.
* **Bulk level:** `BatchBulkBar` gains `✓ Approve selected`,
  `✕ Decline selected`, `⚠ Warning selected` — same position/order and
  `svg-btn success|danger|warning` styling as the SVG bar, disabled when no
  checked row is decidable (checked ∧ not missing/deleted). One click applies
  to every checked decidable row; the affected count is stated in the button
  title, mirroring the SVG bar's scope honesty.
* **Hotkeys:** `A` approve active row, `D` decline active row, `W` warning
  active row — routed through the shared `keyToAction`, ignored in text fields,
  ignored while a dialog is open (same guard class as the SVG tab).
* **Persistence per gesture:** group the touched rows by `(dirPath, base)` and
  rewrite each touched `<base>.json` once (atomic overwrite — the file is
  app-owned metadata, same protocol as `applyOutcomes` today). A failed write
  keeps the change in memory, says so in a red toast (RULE 2), and the next
  successful write of that group heals the file.
* **Undo (RULE 12):** every gesture — bulk decide, row decide, hotkey, preview
  auto-assign, expected-icons re-classify — pushes ONE `batchReview` history
  entry carrying `{relPath, dirPath, base, before, after}` per touched row.
  `src/state/apply.ts` gains the `batchReview` case following the `svgReview`
  pattern: a mounted BatchPanel binds itself as the live applier
  (`bindBatchReviewApplier` in a new `src/batch/reviewundo.ts`); the fallback
  rewrites the named `<base>.json` files directly from the records (they carry
  dirPath+base, so no source index is needed).

### 4.5 The split gate (requirement 2)

* `Row` gains `review: ReviewStatus` (default `pending`), read from the state
  file on scan (`toRow`), updated in memory by §4.3/§4.4.
* **Button:** `batch-process` (testid unchanged) becomes
  **"▶ Split approved (N)"** where
  `N = rows where selected ∧ review === "approved" ∧ eligible`. Enabled iff
  `N > 0 ∧ !busy`. Before any preview every row is pending → N = 0 → disabled
  with title "Run Preview splits first — only approved images are split".
  That makes "only after preview is finished" a property of the state, not a
  flag that can drift.
* **Run (defence in depth):** `batchOps.batchProcess` re-filters the checked
  rows to `review === "approved"` before building items — a declined/warning/
  pending row can never reach `processItems`, whatever invoked the run. The
  run's toast accounts for exclusions honestly:
  `Split 12 · 3 warning not included · 1 declined not included` (RULE 2/4).
* **Post-run safety net (requirement 1 at write time):** after `processItems`,
  every processed item whose real `splits` count ≠ `expectedIcons` is
  re-classified to `needs-review` (written to the state file with the rest of
  the outcomes) and named in the toast — the preview approved it, the run
  disagreed, the row must not look clean. Failed/skipped items keep their
  review (an approved row that failed stays approved → retryable).

### 4.6 Persistence & scan merge (RULE 13)

* `SourceRecord` (`src/lib/statefile.ts`) gains `review?: ReviewStatus` and
  `reviewUpdated?: string` (ISO). Optional fields → every existing state file
  reads unchanged; absent review = pending.
* `parseState` validates `review` through the shared `isReview`; junk is
  dropped to `pending` (one field, never the file). `serializeState` writes it.
* `mergeScan` preserves `review` for known records and stamps `pending` on new
  records. Rescans therefore never lose decisions (same file, same rules as
  processing statuses).
* New `applyReviewOutcomes(root, entries, now)` in `src/batch/statewrite.ts`
  (sibling of `applyOutcomes`, reusing its group-and-rewrite skeleton) — the
  ONE write path for review changes.

### 4.7 List integration

* **New Review column** in `ScanTable` (between Created and Status) with its
  own header cell, so the two axes never blur.
* **Row visuals:** row `className` gains the review value
  (`svg-row batch-row {status} {review}`) — the existing
  `.svg-row.approved::after` / `.declined::after` / `.needs-review::after`
  yellow-line CSS then applies to batch rows with **zero new CSS**. The
  warning icon is the ⚠ glyph inside the badge (state never relies on colour
  alone, same a11y rule as the SVG tab).
* **Filter:** `BatchFilter` (`src/lib/batchfilter.ts`) gains
  `review: "all" | ReviewStatus` (default `"all"`), parsed/validated with the
  existing `pick` helper, surfaced in `BatchFilterGrid` as a "Review" select
  next to the Status select. Sorting by review follows the existing
  `batchsort` rank pattern (pending < approved < declined < needs-review) —
  cheap, optional, do it in the same commit if it stays trivial.
* **Header:** the `svg-attention` strip in `ScanTable`'s header gains
  `N approved` (green) and `M warning` (yellow) counts, reusing the existing
  counter styling.

---

## 5. Reuse map — "copy and reuse code, do not create duplicate code"

| Artefact | Owner (after this change) | Batch usage |
|---|---|---|
| `ReviewStatus`, `isReview` | `src/lib/reviewstatus.ts` (extracted; `svgmodel` re-exports) | same type, same validator |
| Badge/glyph/tone semantics | `src/lib/reviewmeta.ts` (`statusInfo` + needs-review, label param) | Review badge + bulk titles |
| Hotkey mapping | `src/lib/reviewmeta.ts` (`keyToAction` + `warn`) | A/D/W in `useBatchHotkeys` |
| ✓/✕/⚠ button group | NEW `src/ui/DecisionButtons.tsx` (extracted from `SvgRow.tsx`'s inline trio: same markup, classes, `svg-btn tiny success|danger|warning`) | Review cell per-row controls |
| Bulk approve/decline/warning pattern | `src/svg/SvgBulkBar.tsx` (pattern + CSS reused; the bar itself stays per-tab because the surrounding controls differ) | three new buttons in `BatchBulkBar` |
| Yellow line / badges / buttons CSS | `src/index.css` (already shared `svg-*` classes) | zero new CSS expected |
| Undo protocol | `src/svg/reviewundo.ts` pattern → `src/batch/reviewundo.ts` (bind-live-applier + file fallback), one `apply.ts` case | `batchReview` entries |
| Group-and-rewrite state writer | `src/batch/statewrite.ts` `applyOutcomes` skeleton → `applyReviewOutcomes` | all review writes |
| Atomic per-pair philosophy (decision lives beside the images) | I-41 class | decisions live in the pair's existing `<base>.json` |

Deliberately NOT shared: the persistence target (SVG versions live in the pair
sidecar `<stem>.svg.json`; batch decisions live in `<base>.json`) and the
apply/IO code paths — those are different domains and stay in their own tab
directories. Shared = types, semantics, presentation, undo protocol shape.

---

## 6. File-by-file change plan

**New (each well under the 300-line cap):**

| File | Owns |
|---|---|
| `src/lib/reviewstatus.ts` (~30) | `ReviewStatus`, `isReview`, `REVIEW_VALUES` |
| `src/lib/batchreview.ts` (~70) | `clampExpectedIcons`, `classifySplitCount`, `decidableRow`, `approvedCount` (pure, RULE 1/3/8) |
| `src/ui/DecisionButtons.tsx` (~45) | the shared ✓/✕/⚠ group (props: `value`, `disabled`, `onDecide`, `idBase`) |
| `src/batch/ReviewCell.tsx` (~60) | batch Review cell: badge + `DecisionButtons` |
| `src/batch/reviewundo.ts` (~90) | `BatchReviewRec`, `bindBatchReviewApplier`, file-only fallback writer |
| `src/batch/useReview.ts` (~120) | batch review orchestration: `decide(ids, review)`, `autoAssignFromPreview(entry)`, expected-icons re-classify, write coalescing + history entries |

**Touched (small, focused diffs):**

| File | Change |
|---|---|
| `src/lib/svgmodel.ts` | re-export from `reviewstatus` (delete local copy) |
| `src/lib/reviewmeta.ts` | needs-review meta + label param + `warn` key |
| `src/lib/presets.ts` | `expectedIcons` + clamp + validation |
| `src/lib/statefile.ts` | `SourceRecord.review/reviewUpdated`, parse/serialize/merge |
| `src/lib/batchfilter.ts` | `review` filter field + parse |
| `src/batch/useBatchTypes.ts` | `Row.review`; state gains no new global field (review rides on rows) |
| `src/batch/batchOps.ts` | scan passes persisted review into rows; run re-filters approved; post-run re-classify + write |
| `src/batch/statewrite.ts` | `applyReviewOutcomes` |
| `src/batch/useBatchPreview.ts` | optional `onEntry` callback (queue + single paths) |
| `src/batch/ScanTable.tsx` | Review column + row class + header counts |
| `src/batch/BatchBulkBar.tsx` | three bulk buttons + relabelled/gated split button |
| `src/batch/BatchMergeBar.tsx` | expected-icons number field |
| `src/batch/BatchFilterGrid.tsx` | Review select |
| `src/batch/useBatchHotkeys.ts` | A/D/W via `keyToAction` |
| `src/batch/BatchPanel.tsx` | wire `useReview` + `onEntry` + applier binding |
| `src/svg/SvgRow.tsx` | swap its inline button trio for `DecisionButtons` (behaviour-identical; SVG tests must stay green — this is the proof of reuse) |
| `src/state/apply.ts` | `batchReview` entry type + case |

Legacy-rule check: none of the touched files is a recorded legacy hotspot; the
extracted pieces keep every new function ≤ 30 lines / CC ≤ 10 (RULE 16/18).

---

## 7. UI handles (for `UI_SELECTORS.md` at implementation time)

| Testid | Meaning |
|---|---|
| `batch-review-{relPath}` | the Review cell |
| `batch-review-badge-{relPath}` | the review badge (glyph + label text asserted) |
| `batch-review-approve-{relPath}` / `-decline-` / `-warning-` | per-row decide buttons |
| `batch-approve-selected` / `batch-decline-selected` / `batch-warning-selected` | bulk decides |
| `batch-expected-icons` | expected-icons number field |
| `batch-approved-count` / `batch-warning-count` | header counters |
| `batch-process` | unchanged testid; label becomes "▶ Split approved (N)" |

---

## 8. Edge cases

* **Rescan / restart:** decisions re-read from `<base>.json`; new files start
  pending; deleted rows keep their record (existing `retainAbsent` behaviour).
* **`missing`/`deleted` rows:** not decidable, never counted, never split.
* **Ref-missing rows:** still decidable and splittable (existing behaviour:
  continue without the reference copy — the warning banner stays).
* **Row checked after preview:** pending → excluded from the run; the toast
  names it. Preview that row (or bulk-approve it) to include it.
* **`expectedIcons` changed between preview and split:** the run's post-check
  (§4.5) still catches a mismatch at write time — the gate uses the decision,
  the run verifies the result.
* **Clear previews:** cached preview entries drop; decisions persist (they are
  facts in the state file, not cache).
* **Preset switch:** rows re-read nothing (decisions are per-file, not per
  preset); only `expectedIcons` changes interpretation, handled by §4.2's
  re-classify.
* **Interrupted preview run (Stop/abort):** entries already landed stay
  classified; the run-end write commits exactly the rows that finished —
  interrupted ≠ failed (RULE 7).

---

## 9. Rules mapping (why this shape)

* RULE 2/4 — every gate refusal is said ("Run Preview splits first…",
  per-run exclusion tally); pending ≠ warning ≠ error are distinct states.
* RULE 5/7 — auto-assignment streams with the preview queue; writes coalesce
  per group; stop/abort honoured; per-item isolation unchanged.
* RULE 10 — one decision, one control: the review badge/buttons are the only
  review writers; `expectedIcons` is the only "how many is right" control.
* RULE 11 — deciding never destroys preview/detection work; it only labels it.
* RULE 12 — every gesture is one undoable entry on the ONE global timeline.
* RULE 13 — `review` validated on read, junk → pending, corrupt file → rebuilt
  as today.
* RULE 16/18 — shared extraction instead of duplication (§16.4 smells), all
  new files ≤ 300 lines, functions in the 4–20 sweet spot.
* RULE 24 — badges, yellow line and the split button update the moment an
  entry lands or a button is clicked, from state, never on a second action.

---

## 10. Test plan (TDD — red first, then green)

| New test file | Locks |
|---|---|
| `tests/batchreview.test.ts` | `classifySplitCount` (4/4 → approved; 3, 5, 0 → needs-review), `clampExpectedIcons` (junk → 4, bounds), `decidableRow`, `approvedCount` |
| `tests/batch_review_state.test.ts` | `SourceRecord.review` round-trip; corrupt review → pending; `mergeScan` preserves/stamps; `applyReviewOutcomes` writes the right groups exactly once |
| `tests/batch_review_ui.test.tsx` | Review cell badge + three buttons; bulk buttons enable/disable by decidability; header counters; review filter; row class carries review (yellow line hook) |
| `tests/batch_review_gate.test.ts` | split button disabled with only pending/declined/warning checked; enabled for approved; run processes ONLY approved∧checked (process.ts deps injection — no folder writes in test); post-run `splits ≠ expected` → needs-review + toast names it |
| `tests/batch_review_undo.test.ts(x)` | bulk decide = one `batchReview` entry reversing every touched row; auto-assign run = one entry; fallback writer patches `<base>.json` without a mounted panel |
| `tests/reviewstatus_shared.test.ts` | single-source proof: `svgmodel` and batch import the same `ReviewStatus`/`isReview`; `SvgRow` renders the shared `DecisionButtons` (SVG suite stays green) |

Existing suites that must stay green untouched in behaviour: `svg_ui`,
`svg_review_status`, `batch_ui`, `batch_merge_preview`, `batch_selection_v2`,
`batch_filter`, `batch_split` (the full `npm run verify:fast` gate).

## 11. Docs to update in the implementation commit (RULE 17)

* `docs/current/SYSTEM_OF_RECORD.md` — Batch §2 rows (review axis, gate,
  auto-assign, persistence) + new invariants I-66…I-69 (below) + §7 module
  rows for the new files.
* `docs/current/UI_SELECTORS.md` — §7 handles.
* `docs/current/QUALITY_RECHECK.md` — one dated entry with measured gate
  numbers.
* This doc — "Implementation (final)" section (files, deviations, test count).
* `docs/README.md` row — added with this plan (see below).

## 12. Proposed invariants

* **I-66 (the gate, RULE 6/15 class):** a row reaches `processItems` only when
  it is checked AND its review is `approved`; declined, warning and pending
  rows never write a single file, whatever invoked the run.
* **I-67 (auto-status, RULE 4):** every finished preview classifies its row —
  `count === expectedIcons` → approved, every other outcome (including a
  preview error) → warning — and the row shows it (badge + line) immediately.
* **I-68 (persistence):** a review decision lives in the pair's own
  `<base>.json` beside the images, survives rescan/restart, and is validated on
  read; junk decays to pending, never to a crash.
* **I-69 (undo):** one decision gesture — bulk, row, hotkey, preview run or
  expected-icons change — is ONE `batchReview` history entry that reverses
  every row it touched.

## 13. Rollout order

1. `reviewstatus.ts` extraction + `reviewmeta` extension (SVG suite green).
2. `batchreview.ts` pure helpers + `presets.ts` field (+ tests).
3. `statefile.ts` + `statewrite.ts` persistence (+ tests).
4. `useReview` + `useBatchPreview.onEntry` + `reviewundo.ts` + `apply.ts`
   (+ undo tests).
5. `ScanTable` Review column + `DecisionButtons` extraction (`SvgRow` swap) +
   `BatchBulkBar` buttons + `BatchMergeBar` field + filter/hotkeys (+ UI
   tests).
6. Gate in `batchOps`/`process` + post-run re-classify (+ gate tests).
7. Docs (§11) + `npm run verify` before push.
