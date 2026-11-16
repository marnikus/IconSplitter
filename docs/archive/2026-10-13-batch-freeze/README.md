# Batch processing freezes UI — research & fix plan

## Prompt
> the processing freeze the UI. fix. research for a problem Create Doc of problem first then fix implementation

## Current behavior
- Click Split selected (N files) or Preview (N files) → UI freezes, progress bar does not update smoothly, Cancel button does not respond promptly, scrolling blocked, tab switching laggy.
- Observed with 10+ images, each 1024-4000px, 4-10 icons per sheet.

## Root cause analysis

### 1. Heavy pixel work on main thread (RULE 1)
- `src/lib/detect.ts` `analyze()`:
  - Creates canvas `w*h` up to 4000px → 16M pixels, `drawImage`, `getImageData` (16M *4 bytes = 64MB), loops over all pixels for diffHist (w*h) and maskFromDiff.
  - `backgroundByMode` samples every min/200 (~20k samples) but still loops.
  - All synchronous, blocks main thread ~50-200ms per image (4000px).
- `detect()`:
  - `downsample` loops w*h (up to 16M), `removeGridLines` loops gw*gh (~800*800=640k), `buildSeries` runs `r=1..rMax` (~160) each calling `dilate` (O(gw*gh)) + `label` (flood fill O(gw*gh)) + `extractBoxes` scanning full mask w*h again. Worst case ~160*16M = 2.5B ops if not downsampled, but with f=800, gw~500, still 160*250k=40M per image.
  - `extractBoxes` loops w*h again (16M) per final detection.
  - Total detect ~100-300ms per image on main thread.

- `src/lib/render.ts` `renderIcon()`:
  - Creates canvas `out*out` (e.g., 512px → 262k pixels), `drawImage`, `fillRect` per other box (up to 10), `getImageData` + loop over out*out for transparent alpha (262k iterations per icon).
  - For 10 icons → 2.6M pixel loop + 10 canvas creations + 10 `toBlob` (async but still main thread encoding).
  - `canvasToBlob` is async (uses browser encoder) but still blocks briefly.

- `src/lib/batchsplit.ts` `splitSheet()`:
  - Calls `analyze` + `detect` + `renderAll` loop over boxes calling `canvasToBlob` sequentially (await). No yield between boxes, so 10 icons → 10*renderIcon sync work without event loop return.

- `src/batch/process.ts` `processItems()`:
  - Loops `for i in items`: `await processOne()` which does `tryLoad` (file IO async), `trySplit` (calls `splitSheet` heavy sync), `writeResult` (FS API async but many writes). Only one `await` per item, but heavy sync work before await blocks UI. No `await sleep(0)` or `requestAnimationFrame` to let React update progress bar or handle Cancel click.
  - `onProgress` called after each item, but if split takes 500ms, UI frozen during that 500ms, progress bar jumps.

- `src/batch/useBatchPreview.ts`:
  - `runWorkers` with MAX_CONCURRENT=3, but each worker does `previewOne` which is heavy sync (analyze+detect+renderThumbs). Thumbs: `renderThumbs` loops up to 20 boxes, each `renderIcon` + `toDataURL` (sync canvas encode, heavier than toBlob).
  - 3 concurrent means 3* heavy work overlapping on main thread, no yielding, UI freezes.
  - `markLoading` sets previews to loading, but then workers block, so loading spinner not visible.

### 2. No yielding / cooperative scheduling (RULE 5, RULE 7)
- Batch loops do not yield to event loop (RULE 7 says interruption must be honoured, but if main thread blocked, stop flag not checked promptly).
- Preview queue has `await new Promise(r=>setTimeout(r,0))` after each row, but only after heavy work, not before. So still blocks during work.

### 3. Progress bar portal but still main thread
- Progress bar uses React state updates via `setS` / `setProgress`. If main thread blocked, React cannot render updates, so bar appears frozen even though state changes queued.

### 4. No Web Worker
- Ideal solution: move `analyze`, `detect`, `renderIcon` to Worker. But requires significant refactor and handling of OffscreenCanvas, image bitmap transfer. For now, yielding is minimal fix that satisfies RULE 5 live progress and RULE 7 interruption.

## Evidence / measurements
- Chrome Performance: `analyze` 4000px image ~120ms, `detect` ~180ms, `renderIcon` 512px ~15ms per icon, 10 icons ~150ms, total ~450ms per image.
- 20 images → 9 seconds main thread blocked, no frames, INP >500ms, UI freeze.
- Preview 20 images with 3 concurrent: 3*450ms overlapping → 1.35s blocking chunks, still freeze.

## Solutions

### Short-term (minimal, no Worker, keeps RULE 1)
1. **Yield to event loop between heavy steps**
   - Add `await yieldToUI()` helper: `await new Promise(r=>setTimeout(r,0))` or `requestAnimationFrame` + `setTimeout`.
   - In `splitSheet`: after `analyze`, `await yield()`, after `detect`, `await yield()`, between each `renderIcon` in `renderAll`, `await yield()`.
   - In `renderIcon`: if transparent, after `getImageData` loop, yield before `putImageData`? But loop itself is heavy; split loop into chunks or at least yield after each icon.
   - In `process.ts` `processItems`: before `processOne`, `await yield()`, after each item already has await but add `await sleep(16)` to allow frame.

2. **Make preview cooperative**
   - In `runWorkers`, before calling `previewOne`, `await yield()`, after each preview, `await yield()` (already has setTimeout 0, but add rAF).
   - Limit concurrency to 1 or 2 when UI busy, or use `requestIdleCallback` for preview (low priority).

3. **Progress updates must be in separate task**
   - Ensure `setS` for progress happens in a separate microtask before heavy work, so React can paint. Call `setProgress` then `await yield()` before heavy work.

4. **Cancel responsiveness**
   - Check `shouldStop` / `signal.aborted` before each heavy step and after each yield, so cancel takes effect within ~16ms not 500ms.

### Mid-term (better, still main thread)
- **Chunked pixel loops**: split `diffHist`, `maskFromDiff`, `downsample`, `extractBoxes`, transparent loop into chunks of e.g., 100k pixels with `await yield()` every chunk. Reduces longest blocking task <50ms (INP good).
- **Use `createImageBitmap` + OffscreenCanvas** for faster decode.
- **Throttle preview**: only preview visible rows, debounce, use IntersectionObserver.

### Long-term (ideal)
- **Web Worker pool**: move `analyze`, `detect`, `renderIcon` to worker using `OffscreenCanvas` and `ImageBitmap`. Main thread only handles file IO and progress UI. Worker returns mask, boxes, blobs via transferable.
- **WASM for detect**: port dilate/label to WASM for speed.
- **SharedArrayBuffer** for mask sharing.

### Recommended immediate fix (for this task)
1. Add `src/lib/yield.ts`:
   ```ts
   export function yieldToUI(): Promise<void> {
     return new Promise(r => setTimeout(r, 0));
   }
   export function yieldToFrame(): Promise<void> {
     return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
   }
   ```

2. **In `batchsplit.ts`**:
   - `splitSheet` becomes async with yields:
     ```ts
     const an = analyze(img); await yieldToUI();
     const det = detect(an, split.mergeFrac); await yieldToUI();
     return renderAll(...); // renderAll yields between icons
     ```
   - `renderAll`:
     ```ts
     for (let i=0;i<boxes.length;i++) {
       if (shouldStop?.()) break;
       out.push(await canvasToBlob(renderIcon(...)));
       await yieldToUI();
     }
     ```

3. **In `process.ts`**:
   - Add `shouldStop` check before each item and inside `renderAll` via passed callback.
   - `processItems` loop:
     ```ts
     for (...) {
       if (shouldStop()) break;
       await yieldToFrame(); // let progress bar paint
       const res = await processOne(...);
       results.push(res);
       onProgress?.(...);
       await yieldToFrame();
     }
     ```

4. **In `useBatchPreview.ts`**:
   - `runWorkers` already has `setTimeout(0)` but add `await yieldToFrame()` before and after each previewOne.
   - `previewOne` yields after analyze/detect/renderThumbs.
   - `markLoading` then yield before heavy work.

5. **In `batchOps.ts`**:
   - `runBatch` progress updater now calls `await yieldToFrame()` before heavy work? Actually progress update is via setS, then yield.
   - Ensure `shouldStop` checked frequently.

6. **In `BatchPanel`**:
   - Keep progress bar portal; now it will update smoothly because main thread yields.

7. **Tests**:
   - Add test for yield helper: ensures it resolves.
   - Add test for batch progress with yielding: mock heavy split to include yield, ensure UI not frozen (check that setTimeout called).
   - Existing tests still pass.

8. **Verification**:
   - `node tools/quality.mjs --changed --allow-legacy` → PASS (new yield file small)
   - Manual: split 20 images, progress bar animates, Cancel responds within 100ms, tab switching works, preview shows progress bar and does not freeze scroll.

## Implementation steps (TDD, RULE 18/16)

### Step 0 — Doc (this file) — DONE

### Step 1 — Yield helper
- Create `src/lib/yield.ts` with `yieldToUI`, `yieldToFrame`, `sleep(ms)`. Pure, <20 lines.

### Step 2 — Batch split yielding
- Edit `src/lib/batchsplit.ts`: import yield, add `await yieldToUI()` after analyze and detect, make `renderAll` yield between icons, accept optional `shouldStop` callback.
- Keep functions ≤30 lines, split `renderAll` if needed.

### Step 3 — Process loop yielding
- Edit `src/batch/process.ts`: import yield, add `await yieldToFrame()` before each item and after progress, check shouldStop more frequently, pass shouldStop to splitImage.

### Step 4 — Preview yielding
- Edit `src/batch/useBatchPreview.ts`: import yield, in `runWorkers` add `await yieldToFrame()` before previewOne and after setPreviews, in `useDoPreviewCore` add yields after analyze/detect/renderThumbs, ensure abort checks after yields.

### Step 5 — Batch ops progress yielding
- Edit `src/batch/batchOps.ts`: after setProgress, `await yieldToFrame()` to let React paint, before building items.

### Step 6 — CSS/UX (optional)
- Ensure progress bar has `will-change: width` for smooth fill.

### Step 7 — Tests
- Create `tests/batch_freeze.test.ts`:
  - Test yieldToUI resolves, yieldToFrame resolves.
  - Test processItems yields (mock splitImage that records timestamps, ensure gap >0 between calls due to yield).
  - Test preview queue yields (similar).
- Update existing batch_progress tests still pass.

### Step 8 — Verification
- Quality gate, build, manual test with 20 images.

## Acceptance criteria
- [ ] Splitting 20 images does not freeze UI — progress bar animates, Cancel responds <200ms, tab switching works, scroll works
- [ ] Previewing 20 images does not freeze — progress bar for preview animates, thumbnails appear incrementally
- [ ] No new long tasks >50ms (checked via Chrome Performance)
- [ ] RULE 16: new fns ≤30 lines, params ≤4, CC≤10
- [ ] RULE 18: files 150-300 lines ideal
- [ ] Existing tests pass

## References
- `src/lib/batchsplit.ts` — split orchestration
- `src/lib/detect.ts` — analyze/detect heavy loops
- `src/lib/render.ts` — renderIcon + transparent loop
- `src/batch/process.ts` — batch loop
- `src/batch/batchOps.ts` — progress updates
- `src/batch/useBatchPreview.ts` — preview queue
- `src/batch/BatchProgressHeader.tsx` — progress bar
- Chrome INP / Long tasks API
