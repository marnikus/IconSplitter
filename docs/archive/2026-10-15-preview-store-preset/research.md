# Research — stored split previews lost on reload; per-item split decisions not persisted

2026-10-15 · status: **IMPLEMENTED the same day** — F1–F4 below are done, verified in
`docs/current/QUALITY_RECHECK.md` (2026-10-15 entry), rules I-66/67/68 now in
`SYSTEM_OF_RECORD.md` §5. The two open decisions resolved to the defaults: the
merges live in a dedicated `iconSplitter.batch.merges.v1` store; the state JSON
format is unchanged.

## 1. The report, structured

> "Bug in storing the preview splits. after generation the preview removed if page
> was erset [reset] or reload. The previes stores automatically after genereted and
> do not rescard [discarded] or removed from item as preview.
>
> for some specific items it should be stored in preset!
>
> used in split approved process as well. because if it reset to default it will
> not split the image to correct 4 images then."

Expected behaviour (user's terms):

| # | Expectation | Today (verified) |
|---|---|---|
| E1 | Previews **store automatically** right after they are generated | ✅ true — every rendered `done` entry is written (`useBatchPreview.ts:100`, fallback `:91`) |
| E2 | A stored preview is **never discarded/removed** from the row across a page reset/reload | ❌ broken in the real browser (RC1) |
| E3 | A per-item split decision (the merge that yields the correct **4** icons) **survives reload**, scoped to the **preset** | ❌ broken — per-item merges are never persisted anywhere (RC2) |
| E4 | The stored per-item decision drives the **split/approve process**, not only the preview | ❌ broken after a reload — the split reads the in-memory map (RC2) |

## 2. Verified code facts (file:line, working tree 2026-10-15)

**Storage layer — sound.**
- `src/batch/previewPersist.ts` — one record per row in IndexedDB store
  `batchPreviews` (DB v4), key `<rootName>::<relPath>`, value
  `{ relPath, count, thumbs, boxes, status: "done", rootName, at }`; validated
  entry-by-entry on read (RULE 13).
- The **only** deletion path is the panel's Clear button
  (`useBatchPreview.ts:259` → `clearStoredPreviews`). Records are not silently
  dropped by scan, preset change or unmount.

**Generation stores automatically (E1 holds).**
- `useDoPreviewCore` writes every successful render *and* the honest fallback
  (`makeFallback`, count 1) via `persistDone` → `saveStoredPreview`
  (`useBatchPreview.ts:91,100`; `previewPersist.ts:24-26`). Error entries are
  not stored, by design.

**Restore exists but is gated (E2 breaks here — RC1 + RC4).**
- `useRestoreOnRoot` (`useBatchPreview.ts:198-217`) loads this root's records
  once per `root`+`rootName` pair and merges them into the previews map — this
  is what `tests/batch_preview_restart.test.tsx` proves green **in the test
  environment**, where `ensurePermission` always answers.
- **RC1 — the boot permission request cannot succeed without a user gesture.**
  Boot chain: `boot` → `applyHandles` → `grant(stored.source)` →
  `ensurePermission` (`src/batch/picker.ts:27-38`): `queryPermission` answers
  `"prompt"` after a page reload (Chrome resets File System Access permission
  per session for regular sites), then `requestPermission` is called **without
  transient user activation** → the browser rejects it (`NotAllowedError`) →
  the `catch` returns `false` → `grant()` returns `null` → `ctx.root.current`
  stays null → no scan → `s.rootName` stays `""` → `useRestoreOnRoot` returns
  early (`!root || !rootName`) → **no rows, no previews**. The user's only way
  back is re-picking the folder by hand. From outside, "the previews were
  removed".
- **RC4 — restore also waits for a successful scan.** `rootName` is set only
  when `scanOp` starts (`batchOps.ts:53`); any scan failure also blocks preview
  restore, although the records themselves carry `rootName` and the handle
  already knows its `.name`.

**Per-item merge decisions are memory-only (E3/E4 break — RC2).**
- `rowMerges: RowMergeMap` lives in `BatchState` (React state,
  `useBatchTypes.ts`); it is **not persisted anywhere**:
  - `BatchPrefs` (localStorage `batch-prefs-v1`) stores only
    `thumb`/`filter`/`sort` (`src/lib/batchprefs.ts:10-14`);
  - the per-reference state JSON stores `status` + `review` but has **no merge
    field** (`src/lib/statefile.ts:17-28`), and `scan` always passes empty
    override maps (`statewrite.ts:26`);
  - `Preset` (`src/lib/presets.ts:16-22`) has no per-item data either.
- After a reload `rowMerges` is `{}`; `finishScan` prunes it to surviving keys
  only (`batchOps.ts:41-43`) — there is nothing left to prune.
- **The split uses exactly this map:** `batchOps.ts:97`
  `const merges = ctx.state.current.rowMerges` → `splitWithOverride`
  (`batchOps.ts:143`). So after a reload the split cuts with the **global
  default** while the user had tuned that item to yield 4 — the report's "it
  will not split the image to correct 4 images then". E4 broken.
- The preview of a merged row is regenerated **with the override** at apply
  time (`BatchPanel.tsx:45-48` `previewSingle(row, value)`) and **stored** with
  that count — so the stored record says `count: 4` (review auto-approved via
  `shouldSync`) while the next session's split would cut differently. The
  stored preview even hides the breakage.

**Stored records cannot be recognised as stale (RC3).**
- `StoredPreview` carries no settings fingerprint — no `previewKey`, no preset
  name (`previewPersist.ts:10-21`).
- Plain **Preview skips rows whose map entry is `status === "done"`
  (`useBatchPreview.ts:170-171`)**; after a restore, a record rendered under
  *other* settings (different preset, different merge — e.g. the lost override)
  is indistinguishable from a current one, so it is shown and skipped forever.
  The in-session LRU guard (`previewKey`, `batchpreview.ts:17-20`) only covers
  the cache, never the store.

## 3. Root causes, ranked

| RC | Symptom it explains | Fix direction |
|---|---|---|
| RC1 | Previews (and rows) gone after reload in the real browser, tests green | One-gesture re-grant: at boot, when permission is `"prompt"`, keep the handle and surface a "Restore access to `<name>`" button; the click (user activation) calls `requestPermission`, then scan + preview restore run. Never auto-regenerate; the stored records come back untouched. |
| RC2 | Split count wrong after reload; per-item decisions lost | Persist per-item merges **scoped to the preset** (user: "stored in preset"): versioned store keyed `presetName → relPath → merge value`, loaded at boot/preset switch, written by `setRowMerge`/`clearRowMerge`, pruned by scan, read by preview **and** `splitWithOverride`. |
| RC3 | Stale preview reused/skipped after preset or override change | Stamp the record with its `previewKey` at write; on restore, entries whose key ≠ the key computed from current settings+row are **stale**: still displayed (honest history) but treated as not-done by Preview's skip, and marked for the explicit Regenerate. |
| RC4 | Restore blocked when scan fails | Key the restore on `root` alone, using `handle.name` as the rootName (the records carry `rootName`; `matchesRoot` already tolerates field-matching). |

## 4. Rules to add (SYSTEM_OF_RECORD §5, on implementation)

- **I-66 (amends the preview feature):** a rendered `done` preview stores itself
  automatically; a restart restores it without user action and **without
  regenerating**; regeneration happens only on "↺ Regenerate splits" (force) —
  restore must not depend on an un-gestured permission request succeeding.
- **I-67:** a per-item split decision (row merge) survives page reload; it is
  stored **per preset**, and the **same** value drives the preview, the review
  sync and `splitWithOverride` — preview and split can never disagree after a
  reload.
- **I-68:** a stored preview is reused as "done" only while its recorded
  settings fingerprint matches the current effective settings; otherwise it is
  stale — still shown, never silently regenerated, overwritten only by the
  explicit Regenerate (or Preview, which is itself an explicit action).

## 5. Fix plan (TDD, next turn — not started)

1. **F1 (RC1):** picker/permission affordance — extend
   `tests/batch_preview_restart.test.tsx` with a reload case where
   `queryPermission` answers `"prompt"` and `requestPermission` rejects without
   a gesture: the panel must offer the one-click grant; after the click the
   rows AND the stored previews return, nothing regenerated. Implementation:
   `applyHandles` keeps a `pendingRoot` + state flag; `BatchPanel` renders the
   grant button; on click → `ensurePermission` → proceed as boot does today.
2. **F2 (RC2):** `src/lib/batchmerges.ts` — `loadRowMerges(presetName)` /
   `saveRowMerges(presetName, map)` (validated, RULE 13; bounded); wire into
   `useBatch` (load on boot + preset switch), `setRowMerge`/`clearRowMerge`
   (write-through), `finishScan` (prune + persist). Tests: merges survive a
   remount; two presets hold different merges; deleted rows pruned;
   `splitWithOverride` uses the restored map (split count 4 preserved).
3. **F3 (RC3):** add `key` to `StoredPreview` (optional on read for backward
   compat), write `previewKey` at `persistDone`; restore marks mismatched keys
   stale; Preview's skip treats stale as not-done; UI shows the stale state.
   Tests: preset change → restore shows stale, Regenerate rewrites with the new
   key; unchanged settings → skip preserved.
4. **F4 (RC4):** restore keyed on root (+`handle.name` fallback) — test: scan
   error still yields restored previews.
5. Docs in the same change: SYSTEM_OF_RECORD §2/§5 (I-66..I-68)/§6/§7,
   UI_SELECTORS (grant button testid), QUALITY_RECHECK dated entry,
   README index row; this research doc updated to "fixed".

## 6. Decisions still open (default in brackets)

- Storage for per-item merges: separate versioned localStorage key
  `iconSplitter.batch.merges.v1` keyed by preset name [default] vs. embedding
  the map inside each preset of `iconSplitter.presets.v1`. Both are
  preset-scoped as the user asked; the separate key keeps the preset parse
  strict and small.
- Whether the per-reference state JSON should also mirror the merge (visible in
  reports) [default: no — app-owned file format stays as-is].
