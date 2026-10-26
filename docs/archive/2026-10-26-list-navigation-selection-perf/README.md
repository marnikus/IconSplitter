# Large-list row navigation and checkbox response — research and plan only

**Status:** plan only. No application, test, benchmark, dependency, or runtime code is changed by this document. The implementation steps below must not start until the user approves a follow-up.

## Problem to solve

Users report noticeable freezes when clicking rows, checking rows, or moving the active row with Up/Down in the list tabs, becoming prominent above roughly 100 items. The target workload is 1,000+ rows, across Batch, Selection V2, Generate SVG, and SVG to upload. The requested improvement is at least 80% lower response time for the interactions that reproduce the problem.

There are two separate user-visible operations and they must not be conflated:

1. **Active-row navigation:** row click and repeated Up/Down change the active row/highlight (and, where applicable, scroll it into view) without changing checked IDs.
2. **Checkbox selection:** a single row toggle, repeated row toggles, header/select-visible, and clear selection change the canonical checked IDs and visible checks/classes.

The current large-list selection work already added snapshot projection and measured select-visible / clear-all. Its archived production results report 1000-row event-to-committed-DOM reductions of 94.50% Batch, 95.62% Selection V2, 99.07% Generate SVG, and 95.84% Upload; the second-frame proxy reductions are 80.45%, 88.24%, 93.38%, and 92.13%. Those figures **do not test row clicks, active-row arrows, repeated individual checkbox toggles, or sustained key-repeat**. Therefore they neither explain nor disprove this report. Re-run individual checkbox workloads as well rather than assume the older bulk result covers them.

## Repository inspection: established facts vs. hypotheses

### Established from current source

- The four checkable lists render every visible row and its rich row content. There is no virtualization. The earlier performance design intentionally retained mounted rows and controls.
- `src/ui/checkedrows.ts` now projects each committed checked-ID snapshot to registered native checkbox properties and `.selected` classes in a layout effect. React/app-store checked arrays remain canonical; this adapter is presentation only.
- `src/ui/rowpresentation.ts` stabilizes row event callbacks, and the row components memoize expensive content. The earlier benchmark/test suite proves select-visible does not rerun selected preview/format work in its fixture; it is not a general guarantee about active-row navigation or all click paths.
- Arrow handling is implemented by tab-specific paths. `src/selection/hotkeys.ts`, `src/svg/SvgHotkeys.ts`, and `src/upload/UploadHotkeys.ts` construct an ID list from visible rows during navigation, then `nextVisibleId` searches the list. Batch's `useMoveActive` builds selectable IDs, performs a case-insensitive active lookup, then resolves the next ID. At 1,000 rows this is linear per key. That alone does not prove it is the freeze's dominant cost.
- Each active update is committed to the existing app state/history path, and each list marks its active row and scrolls it into view using `useCheckedRow`. Checkbox toggles also use existing undo/history behavior. These effects, row rendering, style/layout/paint, persistence subscribers, and browser scheduling may all contribute and need separate measurement.
- The four list implementations differ in row derivation, active navigation, actions, preview complexity, and state ownership. An all-tabs improvement cannot be assumed from a shared helper change alone.

### Hypotheses to test (not yet confirmed)

1. Rebuilding visible-ID arrays and scanning them on every arrow event adds avoidable CPU, especially during key repeat.
2. A row click or active-state update may invalidate broader list/panel state than the row whose active state changed; this could rerun derived work or cause React to reconcile costly rows.
3. `scrollIntoView`, active-row CSS (including box shadow), and layout/paint of a fully mounted 1,000-row rich list may dominate even if React renders only the old/new active rows.
4. Individual checkbox toggles may incur full registered-row projection, checked-array/history comparison/copying, or broad panel subscriber work that the prior select-all benchmark did not isolate.
5. Startup/scan/thumb decoding and memory pressure can create a general large-list slowdown that a warm, already-mounted interaction benchmark misses.

The first step is to identify which hypothesis is actually supported by traces and deterministic work counters. Do not adopt a large rewrite, virtualize rows, or optimize only the array lookup before that evidence exists.

## Plan and implementation gates

### 1. Reproduce the reported interaction independently

Use the existing real-list fixture and production Chromium benchmark foundation (`tools/perf/selection-response.html`, `tools/selection-response-bench.mjs`, `tests/selection_response.test.tsx`) where possible. Extend the workload in a later approved implementation; do not replace its existing bulk selection cases.

Measure each list at 100, 1,000, and (if fixture/runtime remains representative) 2,000 rows, using the same realistic row data and preview/content code across before/after runs. Keep mount/scan/thumbnail setup separate from interaction timing, then add a separately reported cold-mount/initial-render scenario to identify whether the perceived freeze occurs before interaction.

For each list and count, capture distinct cases:

- plain row click / active-row change;
- one Up and one Down, plus a short burst and sustained key repeat;
- a single checkbox toggle, toggling many different rows, and toggling the same row repeatedly;
- select-visible and clear-all as controls for comparison with the previous measurements;
- keyboard navigation while the active row is on-screen versus requiring `scrollIntoView`.

Report median and p95 event-to-committed-DOM time and event-to-next-frame time; record long tasks and React render/commit counts where possible. State explicitly that the next-frame metric is a proxy rather than a compositor presentation trace. Run the same browser/build/fixture/warmup/sample protocol before and after, with no concurrent benchmarks. Verify active ID, checkbox properties/classes, and order after every timed run.

**Gate:** do not call an interaction fixed based on faster pure helper timings if browser response remains unchanged. Separate CPU/render, layout/paint, mount, and persistence effects in the report.

### 2. Add deterministic failing regressions before production changes

Once the baseline has reproduced a costly path, add tests that fail on its measured work, not merely on elapsed time:

- per-key ID-array construction/search work and active-row lookup counts;
- the number of row shells and expensive row-content/preview computations during active-only updates;
- per-row toggles and checked snapshot projection correctness, including rows toggled while hidden and after filtering/remount;
- callback freshness, active scrolling, row data invalidation, and selection state restored through Undo/Redo;
- uninterrupted repeated arrows without listener churn, stale IDs, dropped keys, or stale active state.

Use real selection/navigation helpers and real row preview code. Keep the existing bulk-select work budget and Chromium measurements intact. Add browser-only tools externally if needed; do not add browser packages to the application dependency/lockfile without a separately approved need.

### 3. Optimize the verified hot path in bounded layers

Apply only optimizations supported by the evidence, in this order:

1. **Navigation lookup:** if array construction/search is measurable, build a stable visible-order/index representation when the visible order changes, then resolve the next eligible ID in O(1) or O(log N) per arrow. Preserve each tab's eligibility, case normalization, boundaries, filtering/sorting, no-wrap behavior, and focus/native-control rules. Do not create a stale cache keyed only by array length.
2. **Active-row render isolation:** if React work is material, ensure only the previous and next active row shells update; keep heavy previews, metadata, dimensions and settings content memoized and live for actual row-data changes. Stable callbacks must invoke the latest committed actions. Do not make all rows insensitive to status/source/preview/settings changes.
3. **Scroll and browser paint:** if traces attribute time to layout/paint, inspect row height, CSS effects, scroll anchoring, `scrollIntoView`, and active highlight styling. Avoid repeated forced layout and unnecessary transitions. Keep keyboard navigation visibly in view and preserve accessibility.
4. **Checkbox path:** profile single-toggle separately from bulk projection. If array/history work dominates, use an indexed representation only behind the same canonical checked-ID state contract and preserve order/undo/session formats. If DOM writes dominate, change projection only with regressions proving all native checks/classes synchronously match canonical state before paint. Do not defer/chunk changes or make the DOM a second source of truth.
5. **Only if proven necessary:** evaluate windowing/virtualization as a separate design decision. Existing behavior keeps rows/controls mounted. Any proposal must explicitly cover active-row scrolling and focus, filtered hidden checked IDs, range anchors, accessible list semantics, per-row controls/local state, thumbnails, and exact bulk scope. Do not introduce virtualization as an unmeasured default fix.

After each layer, rerun the identical benchmark and keep unsuccessful attempts/measurements visible. If 80% is not reached in an affected operation, continue diagnosis rather than declare completion or substitute a different metric.

### 4. Preserve interaction and safety contracts

- Up/Down moves the active row only; it does not check/uncheck, move the selection anchor, or change paid-action scope.
- Row clicks, checkbox clicks, modified/range clicks, header controls, and bulk scopes retain the current cross-tab behavior and remain distinct.
- Hidden checks remain checked across filtering; remounted visible rows reflect the canonical snapshot. Selection order, eligibility, active-row boundaries, and selection counts do not change.
- One user gesture remains one appropriate history entry; no-op gestures remain no-ops. Undo/Redo, session restore, and tab switching still restore the same state.
- No selection/navigation gesture performs filesystem reads/writes, provider calls, thumbnail decoding, preview generation, or export work unless that is already explicitly part of the user action.
- Text inputs, selects, editable content, native controls, dialogs, and modified shortcuts keep their current key ownership.

### 5. Verify, document, then deliver

Run the focused four-tab navigation/checkbox/history/preview tests, new deterministic work regressions, the expanded Chromium benchmark, TypeScript, lint, changed-quality checks, fast and full verification, and production build. Update current performance documentation with the measured scope and limitations only after the implementation passes. Keep raw browser measurement JSON and runner instructions reproducible; keep browser binaries/build products outside Git.

## Acceptance criteria

- At 1,000 rows, for every interaction that the baseline shows is slow, production event-to-committed-DOM median **and** p95 improve by at least 80% on the same fixture/runtime (after ≤20% of baseline). Report the next-frame proxy separately; do not imply it is equivalent to a compositor trace.
- Up/Down remains responsive during sustained key repeat, moves to the correct visible eligible row, scrolls it into view, and does not alter checked IDs.
- A single checkbox toggle and the multi-row/header gestures remain correct and synchronous, with all native checked properties/classes matching canonical state; previous select-all performance does not regress.
- No stale row data/callbacks, lost hidden selection, history/session regressions, or unsafe interaction with paid/provider or filesystem actions.
- If benchmark noise or a browser floor prevents an 80% result for an interaction, document the actual result and remaining bottleneck; do not claim the target was met.

## Relevant owners and existing evidence

- Shared checked-row projection/presentation: `src/ui/checkedrows.ts`, `src/ui/rowpresentation.ts`.
- Selection V2: `src/selection/hotkeys.ts`, `src/selectionv2/ReviewList.tsx`, `src/selectionv2/ReviewRow.tsx`, `src/selectionv2/useSelectionV2.ts`.
- Batch: `src/batch/useBatchHotkeys.ts`, `src/batch/useBatchSelection.ts`, `src/batch/ScanTable.tsx`.
- Generate SVG: `src/svg/SvgHotkeys.ts`, `src/svg/SvgList.tsx`, `src/svg/SvgRow.tsx`, `src/svg/actions.ts`.
- SVG to upload: `src/upload/UploadHotkeys.ts`, `src/upload/UploadList.tsx`, `src/upload/UploadRow.tsx`, `src/upload/uiactions.ts`.
- Shared ordering: `src/lib/reviewselect.ts::nextVisibleId`.
- Existing bulk-selection benchmark/evidence: [large-list selection response](../2026-10-26-selection-response/README.md), [results](../2026-10-26-selection-response/results.md), [current projection contract](../../current/sor/selection-performance.md).
