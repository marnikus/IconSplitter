# Batch Split Selected — persistent progress bar (same as Generate SVG)

## Prompt
> Split selected should run is long process. it requires a bar process. same as in Generate SVG bar. reuse and create similar bap progress. persisting across tabs as it runs.

## Research — Generate SVG progress bar

### Files involved
- `src/ui/Workbench.tsx` — shell with `<div id="svg-progress-mount">` above nav, `app-main`, log dock. Mount lives outside tab panels.
- `src/svg/SvgProgressHeader.tsx` — persistent bar, portalled to `#svg-progress-mount` via `createPortal`, so visible when switching tabs even though `svg-shell` div is `hidden`.
- `src/svg/SvgPanel.tsx` — renders `SvgProgressHeader` with props `progress, running, queue, chain, currentId, rows, rootRef, onCancel, onDismiss, onReview`. Also renders `RunRecord` (batch strip) inside tab.
- `src/svg/types.ts` — `RunProgress` shape: `runId, batchId, index, batches, count, cols, rows, composite, hash, saved, failed, missing, startedAt, perRequest, images, outcomes[]`
- `src/svg/runtotals.ts` — `runTotals(progress, queue)` → `{done, left, failed, images, queued, request, requests}`. `withChain` adds chain totals for queued batches.
- `src/svg/ctx.ts` — `useSvgCtx` owns refs, dispatches `progress`, `progress-fn`, `current`, `rows`. `setProgress`, `setProgressFn` memoized.
- `src/svg/statemodel.ts` — model holds `progress: RunProgress|null`, `running`, `queue`, `chain`, `currentId`.
- `src/svg/RunRecord.tsx` / `SvgBatchStrip.tsx` / `SvgBulkBar.tsx` — secondary progress UI inside tab (composite image, counts, elapsed).

### How persistence works
1. Mount div `#svg-progress-mount` is in `Workbench.Shell`, outside `Panels`.
2. `SvgProgressHeader` checks `shouldShow = progress!==null && runId!==dismissed`. If true, it portals its content to mount. Even when tab hidden (`hidden={tab!=="generateSvg"}`), React tree still exists, portal target is outside hidden container, so bar stays visible.
3. Dismiss logic: local `dismissed` state remembers last dismissed `runId`. New runId clears dismissed. Complete bar has Dismiss button → sets dismissed + dispatch `progress=null`.
4. Cancel: click → `showCancel` state → `CancelDialog` modal with Esc handler, stats, Keep running / Cancel batch. Confirm calls `onCancel` which aborts controller.
5. Current file: `useCurrent` derives `currentRow` from `currentId` or `rows.find(r=>r.running)`. `ProgressThumb` uses `useSideThumbs(rootRef)` to load thumbnail URL for `relPath`.

### Styling
- CSS in `src/index.css`: `.svg-progress-header`, `.svg-progress-left`, `.svg-progress-center`, `.svg-progress-right`, `.svg-progress-track`, `.svg-progress-fill`, `.svg-progress-thumb`, `.svg-progress-file`, `.svg-progress-stats`, `.svg-progress-percent`, `.svg-backdrop`, `.svg-modal`. Tailwind + custom.
- Layout: flex row, left = thumb + text (title + filename), center = track + stats, right = percent + cancel/review/dismiss.

### Current Batch implementation gaps
- `src/batch/useBatch.ts` — state `busy: string|null`, no structured progress. Only toast.
- `src/batch/batchOps.ts` — `batchProcess` sets `busy="Preparing…"` then `onProgress=(d,t)=>set busy="Splitting d/t…"`. No current file, no thumb, no percent, no runId, no saved/failed counts.
- `src/batch/process.ts` — `processItems` loops, calls `onProgress(done,total,relPath)` per item. Returns `BatchReport` with results, but intermediate outcomes not exposed to UI until finalize.
- `src/batch/BatchPanel.tsx` — `BusyOverlay` full-screen modal with spinner, Stop button. Blocks UI, not persistent across tabs, no progress bar, no thumbnail, no completed/remaining.
- No mount for batch progress, no portal, no cancel dialog, no complete state.

## Desired behavior — Batch progress bar

### User-visible
- When user clicks Split selected (N files), a bar appears pinned above tab header (same visual level as SVG bar), persists when switching to Single sheets, Selection, Generate SVG, Upload.
- Bar shows:
  - Left: thumbnail of current file being split (loaded via existing `thumbUrl` / `useThumbCache`), plus title "Splitting icons · N files" and current filename (with title attr for full path)
  - Center: progress track (percent = done/total), stats "X completed / N" and "Y remaining", maybe "Z icons" total splits?
  - Right: percent number + "✕ Cancel batch" button (with confirmation)
- While running, Batch tab list still interactive? Currently `canSplit` disabled when busy, but with persistent bar we should keep busy state but allow tab switch. Bulk bar Split button disabled while running.
- On complete: bar switches to complete variant "Batch split complete" with "✓", stats "N processed · X icons", 100%, button "→ Review results" (scrolls to batch list? or just dismiss) and Dismiss ✕.
- Cancel: click Cancel → dialog modal "Cancel batch split?" showing current file thumb, index, completed/remaining, note "Completed splits stay saved". Keep running / Cancel batch.
- Progress persists across tabs until dismissed or new run starts. If user starts another batch split while previous complete bar still visible, new runId replaces and bar shows running again.
- If both SVG generation and Batch split run simultaneously, both bars should be visible stacked (two mounts, or one mount with two bars).

### Technical — reuse strategy

#### 1. Mounts in Workbench
- Add `<div id="batch-progress-mount" data-testid="batch-progress-mount">` next to existing `svg-progress-mount` in `Workbench.tsx` Shell. Both outside main. Or create generic `#progress-mount` that holds both bars. Simpler: add second mount.

#### 2. Data model — BatchProgress
Reuse pattern from `RunProgress` but simpler (no composite, no batches, no perRequest):
```ts
export interface BatchProgress {
  runId: string;
  startedAt: number;
  total: number; // selected count
  done: number; // processed so far
  currentRelPath: string | null;
  currentName: string;
  saved: number; // outcome processed
  failed: number;
  skipped: number;
  outcomes: BatchOutcome[]; // or ItemResult[]
  images: number; // total icons? optional
}
```
- Alternatively keep same shape as `RunProgress` for reuse of `runTotals` logic, but batch has no queue/chain. Simplest: own type with `done, left, percent` derived.
- Store in batch state: `progress: BatchProgress|null`, `running: boolean`.

#### 3. State management
- Extend `BatchState` in `useBatchTypes.ts` with `progress: BatchProgress|null`, `running: boolean`.
- In `useBatch.ts` add setters `setProgress`, `setProgressFn`, `setCurrent` similar to svg ctx, or directly in `batchOps.ts` via `setS`.
- `batchOps.ts` `runBatch` should:
  - Generate runId `crypto.randomUUID()` or Date.now string
  - Init progress `total=selected.length, done=0, currentRelPath=selected[0].relPath, startedAt=Date.now(), saved=0, failed=0, skipped=0`
  - Set `running=true, progress=init, busy=null` (remove busy modal, use bar)
  - In loop, after each item, update progress with new done, current, saved/failed/skipped from result, outcomes array
  - On cancel (`shouldStop`), set `stopped=true`, break, then set running=false but keep progress for complete bar showing partial.
  - On finish, set running=false, progress final.

#### 4. Component — BatchProgressHeader
- Create `src/batch/BatchProgressHeader.tsx` mirroring `SvgProgressHeader.tsx`:
  - Props: `progress, running, rows, thumbFor, onCancel, onDismiss, onReview`
  - Internal `dismissed` state per runId
  - `useCurrent` → `done, left, percent, currentRow` (find row by `currentRelPath`)
  - `RunningBar`: left thumb (use `thumbFor` to load URL), title "Splitting icons · {total} files", file name, center track + stats, right percent + Cancel
  - `CompleteBar`: check icon, title "Batch split complete", stats, 100%, Review + Dismiss
  - `CancelDialog` similar, with Esc handler
  - `ProgressThumb` component that loads thumbnail via `thumbFor(relPath)` promise → URL, similar to SVG's `useSideThumbs`
  - Portal to `#batch-progress-mount` via `createPortal`
  - CSS classes reuse `.svg-progress-header` or create `.batch-progress-header` sharing same styles. For minimal change, reuse same CSS classes (rename to generic `.progress-header` or duplicate). Better: create `.batch-progress-header` extending same styles in index.css.

#### 5. Integration in BatchPanel
- `BatchPanel.tsx` currently renders `BatchBulkBar` with `onSplit`. It also has `useBatchView` which provides `core.s.progress` etc.
- Add `BatchProgressHeader` rendering at top of BatchPanel? But to persist across tabs, it must be portalled. So render `BatchProgressHeader` inside `BatchPanel` but it portals to mount outside, so it stays visible when BatchPanel hidden? Need to check: if BatchPanel is conditionally rendered only when `tab==="batch"` (via `TabWrapper`), then when switching tabs, BatchPanel unmounts, portal would unmount too → bar disappears. Solution: render `BatchProgressHeader` in `Workbench` or in a component that is always mounted, like `Shell`, similar to SVG mount but SVG still mounts because its container is `hidden` not unmounted. BatchPanel is unmounted when tab != batch (see Workbench.Panels: `{tab==="batch" && <TabWrapper><BatchPanel/></TabWrapper>}`) — so it unmounts. To persist, we need to keep Batch progress component always mounted, or move its portal logic to Workbench.
- Two options:
  - Option A: Change BatchPanel rendering to always mounted but hidden (like SVG): `<div hidden={tab!=="batch"}><BatchPanel/></div>` — then portal stays. Simple, matches SVG pattern.
  - Option B: Create separate `BatchProgressMount` component in `Workbench` that reads batch state from a global store/context (like appstore or a new batch progress store). Since batch state currently lives in `useBatch` hook inside BatchPanel, it would be lost on unmount. So need to lift progress state to global store or use a singleton module.
- Best: lift batch progress to a global module `src/batch/progressStore.ts` with `getProgress`, `setProgress`, listeners, similar to `appstore`. Then `Workbench` can render `BatchProgressHeader` always, reading from that store, independent of BatchPanel mount. Or use `useBatch` as global singleton via context provider at Shell level.
- Simpler reuse: make BatchPanel always mounted hidden (like SVG), not conditional. Then its `useBatchView` hook stays alive, progress state persists. Then `BatchProgressHeader` portalled to mount will stay visible across tabs because its parent (BatchPanel) still mounted hidden, portal target outside hidden div still visible. This matches SVG's existing pattern exactly.
- Steps: In `Workbench.tsx`, change batch rendering from `{tab==="batch" && <TabWrapper><BatchPanel/></TabWrapper>}` to `<div hidden={tab!=="batch"}><TabWrapper><BatchPanel/></TabWrapper></div>` similar to svg-shell. Then BatchPanel's progress header portal will persist.

#### 6. CSS
- In `src/index.css`, add `.batch-progress-header` styles mirroring `.svg-progress-header`, or make generic `.progress-header` shared. Also `.batch-progress-mount` container styling (flex column gap).
- Ensure mount divs in Workbench have appropriate styling: maybe `flex flex-col gap-1` to stack multiple bars.

#### 7. Cancel flow
- `process.ts` already supports `shouldStop` callback checking `ctx.stop.current`. Keep that. On cancel confirm, set `stop.current=true`, which breaks loop.
- After cancel, `finalize` still runs, updates rows, sets toast, sets `running=false`, progress final with partial counts.

#### 8. Review action
- On complete bar, Review button could scroll to batch list or switch to batch tab and dismiss? Simplest: `onReview` = `openTab("batch")` + focus list. Or just dismiss. SVG's Review scrolls to results. For batch, Review could just dismiss and ensure batch tab active.

## Implementation steps (TDD, RULE 18/16)

### Step 0 — Doc (this file) — DONE

### Step 1 — Types & store
- Create `src/batch/BatchProgress.ts`:
  - `export interface BatchProgress { runId, startedAt, total, done, currentRelPath, currentName, saved, failed, skipped, outcomes }`
  - Helper `batchTotals(progress)` → `{done, left, percent, images}` (pure)
  - `NO_PROGRESS` etc.
- Extend `BatchState` in `useBatchTypes.ts` with `progress: BatchProgress|null, running: boolean`

### Step 2 — Workbench mounts
- Edit `Workbench.tsx`:
  - Add `<div id="batch-progress-mount" data-testid="batch-progress-mount">` next to svg mount
  - Change batch panel rendering to always-mounted hidden div (like svg)
  - Optionally add wrapper `<div className="progress-mounts">` holding both mounts, styled column.

### Step 3 — BatchProgressHeader component
- Create `src/batch/BatchProgressHeader.tsx`:
  - Reuse logic from `SvgProgressHeader.tsx` but with batch props
  - Props: `progress, running, rows, thumbFor, onCancel, onDismiss, onReview`
  - Internal dismissed state, Esc handler, CancelDialog, Track, ProgressThumb
  - Portal to `#batch-progress-mount`
  - Tests: render with progress null → null, running → shows title, file, percent, cancel; complete → shows complete, review, dismiss; cancel dialog shows stats; thumb loading.
  - Keep functions ≤20 lines, ≤4 params, CC≤10, file ≤300 lines (RULE 18/16)

### Step 4 — Update batchOps & process to emit progress
- `batchOps.ts`:
  - `batchProcess` now creates `BatchProgress` init, sets state via `setS` with `progress`, `running=true`, `busy=null`
  - `runBatch` signature change to accept `setS` and update progress on each `onProgress` callback: increment done, update current, update saved/failed from result
  - On stop, set `running=false` but keep progress for complete bar
  - On finish, set `running=false`, final progress
  - Add `cancel` action to set `stop.current=true` and keep progress
- `process.ts` already calls `onProgress(done,total,relPath)` — keep, but also need to return per-item result to batchOps for saved/failed counts.

### Step 5 — Integrate in BatchPanel
- `BatchPanel.tsx`:
  - Import `BatchProgressHeader`
  - Get `thumbFor` from `useThumbCache`
  - Render `<BatchProgressHeader progress={v.core.s.progress} running={v.core.s.running} rows={v.core.s.rows} thumbFor={thumbFor} onCancel={v.core.cancel} onDismiss={()=>v.core.setProgress(null)} onReview={()=>{ /* open batch tab */ }} />`
  - Remove `BusyOverlay` full-screen modal (or keep as fallback but prefer bar)
  - Ensure `canSplit` disabled when `running`

### Step 6 — CSS
- Edit `src/index.css`:
  - Add generic `.progress-header` or duplicate `.svg-progress-header` styles for `.batch-progress-header`
  - Add mount styling `#batch-progress-mount`, `#svg-progress-mount` as flex column
  - Ensure `.svg-progress-header` and `.batch-progress-header` share same track/fill/thumb styles

### Step 7 — Tests (TDD)
- Create `tests/batch_progress.test.tsx`:
  - Mock thumbFor, rows, progress
  - Test: null progress → no bar
  - Running progress → shows title, file, percent, track width, cancel button, thumb
  - Complete progress → shows complete title, 100%, review, dismiss
  - Cancel dialog → appears on cancel click, shows stats, Keep running / Cancel batch
  - Portal: bar renders into `#batch-progress-mount` when mount exists
  - Persist across tabs: when Workbench mounts both bars, batch bar visible even when batch tab hidden (test via hidden attribute)
- Update `batchOps.test.ts` if exists, or add test for progress updates: mock setS, run batchProcess with 2 items, ensure progress done increments, currentRelPath updates, running toggles.

### Step 8 — Verification
- `node tools/quality.mjs --changed --allow-legacy` → GATE PASSED
- `npm run test -- tests/batch_progress.test.tsx tests/batch_* --reporter=verbose` → all PASS
- `npm run build` → PASS
- Manual: select 10 images, Split selected → bar appears pinned above tabs, shows current file thumb, percent increases, switch to Generate SVG tab → bar still visible, switch back → still visible, Cancel → dialog → Cancel batch → stops, complete bar shows, Dismiss → bar disappears.

### Step 9 — Cleanup & docs
- Update `docs/current/SYSTEM_OF_RECORD.md` row for batch progress
- Update `docs/README.md` map
- Ensure no new duplication: reuse `Elapsed.tsx`, `useEsc`, thumb loading pattern.

## Acceptance criteria
- [ ] Split selected long process shows persistent bar progress (not just modal)
- [ ] Bar same visual as Generate SVG bar (thumb + file + completed/remaining + track + percent + Cancel)
- [ ] Bar persists across tabs (portal to mount outside tab panels, batch panel always mounted hidden)
- [ ] Cancel with confirmation dialog, keeps completed saves
- [ ] Complete state with Review + Dismiss
- [ ] Reuses SVG progress patterns (portal, runTotals, thumb loading, Esc, dismissed per runId)
- [ ] RULE 16: no new fn >30 lines, params >4, CC>10, nesting>4
- [ ] RULE 18: file 150-300 lines ideal, functions 4-20 lines
- [ ] Tests for new component

## References
- `src/svg/SvgProgressHeader.tsx` — persistent bar implementation
- `src/ui/Workbench.tsx` — mounts
- `src/svg/runtotals.ts` — totals arithmetic
- `src/batch/batchOps.ts` — current batch process
- `src/batch/process.ts` — loop with onProgress
- `src/batch/useBatch.ts` — state
- `src/batch/BatchPanel.tsx` — UI
- `src/index.css` — styles for svg-progress-header
