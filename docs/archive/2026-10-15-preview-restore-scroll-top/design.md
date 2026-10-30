# Design — preview splits survive a restart · regenerate control · back-to-top button

Date: 2026-10-15 · Branch: `arena/d96a18fe-iconsplitter` · TDD-first (RULE 8),
sizes per RULE 18, gates per RULE 16.

## 1. The request, restructured

The original report (verbatim, reordered for clarity):

> preview splits should be stored and restore after the pafe restart. now all
> splitted images preview are not visible after restart system and requre user
> to regenerate it again after control. It should be saved and regenerated only
> if the user select it again and click "regenerate splits" preview. (add btn
> control) - will rewrite older already existing splits.
>
> 2 — add btn arrow up in corner to quick return to the top of items list. New
> feature an all tabs.

Structured into requirements:

| # | Requirement | Acceptance |
|---|---|---|
| R1 | Split previews are **stored** (they survive a page restart) and **restored** without any user action | After remount with the root restored, count + thumbnails render on their own |
| R2 | Previews are regenerated **only** by an explicit user click on **Regenerate splits**; that click **rewrites** the older stored previews | Force-run bypasses every cache; the stored record is replaced |
| R3 | **Preview splits** (the plain button) never re-renders rows that already have a preview | Rows with a `done` entry are skipped |
| R4 | Every tab gets a corner **arrow-up button** that returns to the top of the items list | One shared control on the shell; visible after scrolling; scrolls the list container back to 0 |

Out of scope: per-row regenerate buttons (the bulk control the user names
already exists as `batch-regenerate`), changing what a preview is, and any
change to the split output itself.

## 2. First steps (the order actually followed)

1. **Diagnose** — read the preview path end to end (`useBatchPreview` →
   `previewPersist` → `BatchPanel` → `ScanTable`), then name the defects.
2. **Baseline green** — fix the two pre-existing red tests (below) so the
   suite is a trustworthy gate.
3. **RED** — `tests/batch_preview_restart.test.tsx`: restore on restart,
   regenerate rewrites, preview skips done, re-pick keeps previews, no restore
   storm. `tests/scroll_top.test.tsx`: show/hide/scroll/a11y.
4. **GREEN** — implement; keep every file inside the RULE 18 budget.
5. **Gates** — `tsc`, lint, `quality:changed`, `verify:fast`; docs in the same
   change (RULE 17); dated QUALITY_RECHECK entry.

## 3. Diagnosis — why previews were lost after a restart

Persistence itself already existed (the previous commit added the IndexedDB
`batchPreviews` store, `savePersisted` on every rendered entry and a
`usePersistedLoad` on boot). Four defects made it not work in practice:

* **D1 — the restore effect re-ran on every render.** `useReviewed` in
  `BatchPanel` memoised its two callbacks on `[v]`, and `v` (the view bag from
  `useBatchView`) is a fresh object every render — as is the `ctx` bag in
  `useBatch` that `v.core.decide` closes over. `usePersistedLoad` therefore
  re-ran after every commit: an endless async cycle of IndexedDB reads, a new
  `previews` Map (new render) and — worst — an unconditional
  `onReviewedBatch(batch)` → `decideReview` → `applyReviewOutcomes`, i.e.
  **state-JSON writes to the user's folder on every cycle**. A restored
  session churned storage and disk forever; nothing about it was reliable.
* **D2 — re-picking the folder wiped the previews and nothing reloaded them.**
  A fresh pick yields a NEW handle object, so `useRootChange` saw a change and
  cleared the in-memory map; the persisted-load effect keyed on the root-name
  string did not re-run. In the real browser a restart usually ends exactly
  here: `requestPermission` needs a user gesture, boot cannot re-grant the
  handle by itself, the user re-picks the folder — and the previews stay blank
  until they manually regenerate. This is the reported symptom.
* **D3 — "Regenerate splits" was a no-op with a warm cache.** `usePreviewOne`
  answered from the LRU cache when the preview key matched, so the force
  regenerating run returned the cached entry without rendering or rewriting
  anything — violating R2 outright.
* **D4 — nothing validated the stored payload on read** (RULE 13). A corrupt
  or foreign record went straight into the preview map.

Restored entries also carry no render timestamp, which made "the stored record
was rewritten" unobservable; the stored record now carries an `at` number.

## 4. Design

### 4.1 Preview persistence (`src/batch/previewPersist.ts`, new)

One module owns the store (RULE 3/18 — `useBatchPreview` keeps orchestration
only; it also frees that file to stay ≤ 300 lines):

* `StoredPreview` — `relPath`, `count`, `thumbs`, `boxes`, `status: "done"`,
  `rootName?`, `at?` (render time). `saveStoredPreview(rootName, entry)` writes
  under `rootName::relPath` (fire-and-forget, as before).
* `loadStoredPreviews(rootName)` — validates every record entry by entry
  (`isStoredPreview`: string relPath, finite count ≥ 0, string-array thumbs,
  box array, status "done"); corrupt records are dropped, a failed read is an
  empty map (RULE 13 — one ignored load, never a crash).
* `clearStoredPreviews(rootName)` — unchanged semantics (this root's keys only,
  everything when no name is known).

### 4.2 Restore lifecycle (`useBatchPreview`)

* The restore effect keys on **root AND root name** and its callbacks are
  stable, so it runs once per restore/re-pick, never per render. It merges
  loaded entries under in-session ones and reports the loaded rows once
  through `onReviewedBatch` (the review sync — one bounded write burst, rows
  already correct on disk are filtered by `shouldSync` in `useReviewSync`).
* `useRootChange` keeps clearing memory when the handle changes, but the
  restore effect immediately reloads that root's stored previews (D2 fix).
* Every save stamps `at: Date.now()`.

### 4.3 Regenerate means regenerate (R2/D3)

`previewSelected(selected, force)` threads `force` into the workers and
`previewOne`; a force run **skips the LRU answer** and renders from the file,
then saves over the stored record. Plain preview runs keep the cache (R3).

### 4.4 Stable contexts (supports D1, batch-wide)

* `useBatch.useCtx` memoises the ref bag with `useMemo(..., [])` — its fields
  are refs and are stable by construction, so `chooseRoot/refresh/run/cancel/
  decide` (and every callback downstream) become referentially stable.
* `BatchPanel.useReviewed` depends on `v.core.decide` (stable) instead of `v`.

### 4.5 Back-to-top button (R4)

`src/ui/ScrollTopButton.tsx` — one shared control mounted once in the
Workbench shell (so it exists on every tab by construction):

* watches the app's scroll container (`.app-main`, I-27 — the window never
  scrolls), appears when `scrollTop` passes a threshold (400 px), hides at the
  top;
* click scrolls the container smoothly to 0; `aria-label="Back to top"`,
  `title` says the same, glyph `↑`;
* fixed bottom-right, lifted above the log dock with the published
  `--app-dock-h` (same contract as the toasts), so no row is ever covered;
* `data-testid="scroll-top-btn"`; container injected as a getter prop so tests
  mount it against a plain div (RULE 3 — explicit inputs).

## 5. Baseline fixes (pre-existing red on this branch)

* `tests/batch_flex_thumb_info.test.tsx` expected the detection bar at
  `min-w-[360px]`; the component shipped `min-w-[300px]`. The component takes
  the test's value (the test names the intent).
* `tests/upload_keypersist.test.tsx` opened `iconSplitter` at hard-coded
  version 3 to prove a newer-version open is not blocked; `DB_VERSION` moved
  to 4, so that open is now a downgrade and fails. The test now opens at
  `DB_VERSION + 1` (exported), keeping the intent across future bumps.

## 6. Test plan (RED before GREEN)

`tests/batch_preview_restart.test.tsx` — real panel, fake FS, real IndexedDB:

1. **restore on restart** — preview → unmount → remount (handles restored from
   IDB, no picker): counts visible, rows re-decided, no click.
2. **regenerate rewrites** — seed an OLD stored record (old thumb, old `at`);
   remount shows it; select + Regenerate → entry re-rendered from the file and
   the stored record replaced (`at` moves forward, thumbs replaced).
3. **preview skips done** — the same seeded record; select + Preview → the
   stored record is untouched (same `at`, same thumbs).
4. **re-pick keeps previews** — with previews restored, pick the same folder
   again (new handle object): previews remain visible.
5. **no restore storm** — after the restore settles, IndexedDB reads stay flat
   across further renders.

`tests/scroll_top.test.tsx` — the control against a fake scroller: hidden at
the top, visible past the threshold, click returns to 0, arrow + a11y label,
hides again at the top.

## 7. Verification

`npx tsc --noEmit` · `npm run lint` · `npm run quality:changed` ·
`npm run verify:fast` — measured numbers appended to `QUALITY_RECHECK.md`.
Docs updated in the same change: `SYSTEM_OF_RECORD.md` (§2 batch behaviour,
§6 storage map row for `batchPreviews`, module table), `UI_SELECTORS.md`
(`batch-regenerate`, `scroll-top-btn`), `docs/README.md` (this design's row).
