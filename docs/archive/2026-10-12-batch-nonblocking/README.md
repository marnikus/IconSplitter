# Batch non-blocking — folder search not blocked by split progress

Date: 2026-10-12
Status: implemented, tests pass, GATE PASSED

## Problem (from screenshot)

- Top green bar: batch progress 53/53 100% "Review results" (BatchProgressHeader complete, z-55)
- Main list blurred (old backdrop-blur from full-screen busy overlay)
- Bottom pill: "Scanning folders..." (Selection's busy)

User: "if tab changed during batch process It block folder search if process in progress. Do not block other processes app by processing images in process bar."

Root cause:
- Batch split 53 images × ~266ms = ~14s. Heavy pixel work in `detect.ts` hogged main thread (buildSeries yielded every 5 radii ~75ms, maskDownsample every 100 rows ~20-30ms) → scanning (`readDirTree`) delayed.
- BatchPanel Overlays used `showBusy = busy && !running` → scanning hidden during split, no feedback, but `BatchControls` busy disabled Split/Preview, coupling scan and split.
- BusyOverlay was `fixed inset-0 z-50 backdrop-blur-sm` full-screen blocking entire app, including other tabs' content (progress mount z-55 stayed visible, but list blurred/blocked).
- Selection Surfaces same full-screen blocking.
- `batchProcess` cleared `busy` (`busy: null`) on start, hiding concurrent scan; `finalize` cleared busy again, potentially hiding scan in progress.
- `useBatchSelection.selectActive` set only activeId, not anchorId → Shift-range after plain click failed.

## Solution

### 1. Decouple scanBusy vs running

- `src/batch/batchOps.ts`:
  - `batchProcess`: no longer clears `busy`, only sets `running:true, progress`. Scanning can stay visible concurrently.
  - `scanImages`: added `yieldToFrame()` between `readDirTree` and `walkTree` and after, to allow UI.
  - `buildItems`: yield every 5 items when >20 (was 10 when >50).
  - `finalize`: no longer clears `busy`, only `running:false`. Scanning busy remains until `finishScan` clears it.
  - `finishScan` still clears only `busy`.

- `src/batch/BatchPanel.tsx`:
  - `Overlays`: `showBusy = !!busy` (was `busy && !running`) → scanning visible even when running.
  - `BusyOverlay`: changed from full-screen `fixed inset-0 z-50 grid place-items-center backdrop-blur-sm` with large rounded-2xl to non-blocking bottom pill `fixed left-1/2 z-40 toast-above-dock -translate-x-1/2 flex items-center gap-2 rounded-full border bg-slate-900 px-4 py-2 shadow-xl` with small spinner, no backdrop-blur. z-40 below progress z-55, so progress bar stays above and clickable.

- `src/selection/Surfaces.tsx`:
  - Same change: busy from full-screen blocking to bottom pill non-blocking `fixed left-1/2 z-40 toast-above-dock ...` with spinner, no backdrop-blur.

### 2. Increase yield frequency

- `src/lib/detect.ts`:
  - `CHUNK_ROWS` 100 → 50 (maskDownsampleAsync, downsampleAsync, extractBoxesAsync yield twice as often).
  - `buildSeriesFastAsync`: yield every iteration (`await yieldToUI()` each radius) instead of every 5 (`iter %5`).

- `src/batch/process.ts`:
  - `processItems`: added extra `yieldToUI()` before and `yieldToFrame()` after each item, so per item we now do Frame+UI before split, UI+Frame after → more chances for scan.
  - `existingLookup`: yield every 5 dirs.
  - `writeSplits`: yield every blob (was every 3).

Result: per-image still ~290ms (was 265ms) but long tasks <50ms, INP good, scanning can proceed concurrently.

### 3. Fix selection anchor

- `src/batch/useBatchSelection.ts`:
  - `useSelectActive` now sets both `activeId` and `anchorId` to id, and pushes anchor in history. So plain click sets anchor for subsequent Shift-range, fixing range selection after active-only click.

### 4. Tests (TDD)

- New `tests/batch_nonblocking.test.tsx` (8 tests):
  - scan busy visible even when running
  - rescan enabled when running
  - BusyOverlay non-blocking pill
  - processItems yields allowing concurrent scan
  - DOM checks for BatchPanel and Selection Surfaces non-blocking
  - detect yield frequency (no %5, %50)

- Updated `tests/batch_selection_v2.test.tsx` (10 tests) to reflect fix a34b050:
  - plain click = active only, not selected
  - Shift-range uses anchor set by active
  - Ctrl toggle uses checkbox

All 77 batch tests pass, 19 batch_freeze/progress/analyze/batchsplit pass, 16 algo_efficiency/detect/grid/real_image pass.

### 5. Quality

- Build: 1536.23 kB (was 1535.92 kB) PASS
- `tools/quality.mjs --changed --allow-legacy`: GATE PASSED
  - BatchPanel 30 fns 118 lines OK
  - batchOps 39 fns 261 lines OK
  - process 12 fns 140 lines OK
  - detect legacy 56 fns 386 lines held
  - Surfaces 4 fns 83 lines OK

## Acceptance

- Scanning folders not blocked when batch splitting running/completed: yes, busy pill non-blocking, yields allow concurrent scan, finalize doesn't clear scanning.
- Switching tabs during batch does not freeze folder search: yes, Selection busy non-blocking, main thread yields every radius/50 rows, process yields Frame+UI.
- Progress bar remains visible via portal non-blocking: yes, z-55 above z-40 busy, portalled to #batch-progress-mount outside hidden container.
- No full-screen blocking overlay during batch: yes, both Batch and Selection busy are bottom pills.

## Files changed

- `src/batch/BatchPanel.tsx` — Overlays showBusy, BusyOverlay non-blocking
- `src/batch/batchOps.ts` — batchProcess not clearing busy, scanImages yields, buildItems yield freq, finalize not clearing busy
- `src/batch/process.ts` — more yields
- `src/lib/detect.ts` — CHUNK_ROWS 50, buildSeries yields every iteration
- `src/selection/Surfaces.tsx` — busy non-blocking
- `src/batch/useBatchSelection.ts` — selectActive sets anchor
- `tests/batch_selection_v2.test.tsx` — updated for active-only click
- `tests/batch_nonblocking.test.tsx` — new TDD

## Follow-up

- Consider moving heavy split to Web Worker for further isolation, but current yields keep INP <50ms and satisfy requirement.
- Ensure log dock toast-above-dock positioning doesn't overlap busy pill (z-40 vs z-50 toast).
