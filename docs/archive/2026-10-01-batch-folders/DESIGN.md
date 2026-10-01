# Design — Recursive batch folders, review, presets, output tree (2026-10-01)

Two user decisions (2026-10-01) constrain this design:

- **Explorer reveal → browser-only.** A browser app never sees absolute paths
  and cannot launch Explorer. The per-row action copies the display path
  (`<root>/<relative path>`) to the clipboard and toasts it (RULE 9 fails open,
  RULE 4 stays honest). A native reveal needs a desktop wrapper — out of scope.
- **Layout → new "Batch folders" tab next to the sheet editor.** `src/App.tsx`
  is a 607-line legacy hotspot (RULE 16.5: do not grow). It is **not touched**.
  `src/main.tsx` renders a new `src/ui/Shell.tsx` that keeps both tabs mounted
  (hidden inactive tab preserves sheet state) instead of `App` directly.

## 1. Module map (new code only, legacy untouched)

| Module | Files | Owns |
|---|---|---|
| `src/batch/` | `naming.ts`, `paths.ts`, `status.ts`, `presets.ts`, `fs.ts`, `scan.ts`, `process.ts`, `reducer.ts` | pure batch domain + File System Access boundary + review state |
| `src/ui/` | `Shell.tsx` | tab shell (`tab-sheets`, `tab-batch`) |
| `src/ui/batch/` | `BatchPanel.tsx`, `FolderPickers.tsx`, `PresetBar.tsx`, `BatchSettings.tsx`, `ScanList.tsx`, `ScanRow.tsx`, `ProcessBar.tsx`, `flows.ts` | batch UI; `flows.ts` = scan/process orchestration (no JSX) |

Direction: UI → `flows.ts` → `src/batch/*` → `src/lib/*` (RULE 1: pixel math
stays in `src/lib/detect.ts`, `src/lib/render.ts`; batch calls
`analyze`/`detect`/`renderIcon`/`canvasToBlob`, never hand-rolls canvas math).

## 2. File naming — `src/batch/naming.ts` (pure)

- `parseAiFile(name)` accepts `<base>_AI.<ext>` and `<base>_AI_<digits>.<ext>`
  via `/^(.*)_AI(?:_(\d+))?$/` on the stem; base must be non-empty, match is
  case-sensitive (`_AI` only). Returns `{ base, variant, ext, stem }`.
- `referenceNameFor(aiName)` = `<base>.<ext>` (same-extension guess);
  `findReference` (scan.ts) prefers it, else any image ext in the same folder.
- `statusJsonName(base)` = `<base>.json`, written next to the sources.
- Output naming: `monthFolder` → `YYYY-MM`, `batchFolder` →
  `YYYY-MM-DD_HH-mm-ss` (local time), `splitDirName(i)` → `split_01`,
  `splitFileName(parent, i)` → `<parent>_01.png` (PNG: `renderIcon` output).
- Never-overwrite variations: `uniqueName(wanted, taken)` tries `wanted`,
  then `wanted_v02`, `wanted_v03`, …; `splitCandidates(parent, i, ext, n)`
  yields `<parent>_01.png`, `<parent>_v02_01.png`, … (variation **before** the
  split number). Source variant suffixes (`_AI_7`) are part of `parent`, so
  duplicate suffixes append after them (`_AI_7_v02_01`).

## 3. Paths — `src/batch/paths.ts` (pure)

`joinRel(...parts)`, `dirOf`, `fileOf`, `extOf`, `isImageExt(name, exts)`,
`isIgnoredDir(name, outputDir)` (always ignores `_split_output` plus the
preset's `outputDirName`). Output trees compose with `joinRel`, so one owner
builds every relative path (RULE 22: traceable to source).

## 4. Status JSON — `src/batch/status.ts` (pure)

One file per **(folder, base)**: `<dir>/<base>.json`.

```ts
interface TrackedImage { relPath; size; mtime; hash?; state; lastSeen;
                         lastDone?; output?; note? }
type TrackState = "unprocessed" | "processed" | "skipped"
                | "missing" | "changed" | "deleted";
interface StatusFile { version: 1; base; reference; referenceFound;
                       updatedAt; images: TrackedImage[] }
```

- Identity = relPath + size + mtime, optionally FNV-1a hash (`fnv1aHex`,
  no secure-context requirement unlike `crypto.subtle`).
- `reconcileScan(prev, current, { now, useHash })`: same-path match →
  keep/`changed`/reappeared-as-`unprocessed`; unmatched previous →
  move-match by content (old entry `deleted` + note, new path `unprocessed` +
  note, `moved` event) else first miss `missing`, second consecutive miss
  `deleted`; unmatched current → `unprocessed`. Events `{ added, changed,
  moved, missing, deleted }` drive honest toasts (RULE 4).
- `parseStatus` validates version/shape/numeric sanity and returns `null` on
  corrupt input — rejected, never crash (RULE 13). Fully-deleted groups
  survive because the scan also collects `*.json` candidates and parses them.
- Status files are **rewritten** after every scan and after every processed
  item (spec §6, resume-safe). "Never overwrite" applies to split-output
  assets, not to these live status files — stated here so the two rules do
  not look contradictory.

## 5. Presets — `src/batch/presets.ts` (pure + localStorage)

`BatchPreset { version, name, sourceName, destName, useCustomDest, scan, split,
naming, selection, duplicates, updatedAt }` covers source/dest display names,
scan rules (`includeExtensions`, `ignoreOutputDir`, `useContentHash`), split
settings (`padding`, `size`, `transparent`, `mergeFrac`), naming
(`outputDirName`, fixed `monthFormat`/`batchFormat`/`splitPrefix`/`splitExt`
stored for completeness), selection (`autoSelectNew`, `keepMissingInList`)
and duplicates (`neverOverwrite` always true, `variationPrefix`).

- Browsers cannot persist absolute paths or (portably) directory handles, so
  presets store folder **display names**; handles are re-picked after load
  with an honest note. Settings apply immediately (RULE 24).
- `sanitizePreset` rejects corrupt payloads → defaults (RULE 13);
  `readPreset`/`writePreset`/`removePreset`/`listPresetNames` plus
  `readLastName`/`writeLastName` implement Save / Save As / Load / Delete /
  list / Load-Last, and the last-used preset autoloads on mount.
- `BATCH_SIZES` duplicates the `SIZES` values from legacy `App.tsx`
  deliberately (data, not logic; touching the hotspot to share one const
  risks the ratchet — cross-referenced in a comment).

## 6. FS boundary — `src/batch/fs.ts`

Minimal structural types (`FsFile`, `FsFileHandle`, `FsDirHandle`,
`FsWritable`) — no `any`. `tryGetFile`/`tryGetDir` (NotFound → null, narrow
`isNotFound`), `ensureDir`, `ensureUniqueDir` (variation loop),
`writeFile` (single write + close = complete-or-nothing, RULE 23),
`writeFirstFree` (candidate list), `readTextFile` (null when missing),
`canPickFolders`/`pickFolder` (unsupported/aborted → null, RULE 9),
`loadImageFromFile` (Blob → object URL → `Image`, URL revoked).
Real `File` objects satisfy `FsFile` structurally; writes use
`arrayBuffer()` so fakes and real files share one path (no Blob cast).

## 7. Scan — `src/batch/scan.ts`

`scanRoot(root, opts)` walks recursively via `values()`, skips ignored dirs,
collects images (by extension) with `getFile()` identity (+ hash when
enabled) and `*.json` status candidates; returns `{ files, dirs, status }`.
`aiImages`, `groupByDir`, `findReference` (same-ext preferred, never
AI-shaped, never the file itself), `readHistory` (parse + flatten valid
status files). Rescan happens on folder open, on Refresh, and immediately
before processing (spec §6).

## 8. Review state — `src/batch/reducer.ts`

`useReducer` keeps `BatchPanel` under the hook budget. Three sub-reducers
combined by domain (no giant switch, each CC ≤ 10): items+selection
(`scan-applied`, `toggle`, `select-all`, `deselect-all`, `item-patched`),
settings (`settings-set`), folders (`source-set`, `dest-set`, `dest-mode`).
Missing/deleted items are unselectable and auto-removed from selection
(RULE 6); deselection never deletes scan data (RULE 11).

## 9. Processing — `src/batch/process.ts`

`processBatch(input)` with injected `decode`, `onProgress`, `shouldAbort`,
`now` (RULE 3: explicit inputs; RULE 7: abort re-read every item **and**
every icon; RULE 5: per-item progress + `sleep` yield + per-item failure
isolation). Per item: re-`getFile` (NotFound → `deleted`, skip honestly),
decode → `analyze` → `detect(mergeFrac)` → shared `squareInfo` → per icon
`renderIcon` + RULE 15 gate (dims > 0, blob non-null, size > 0) → unique
parent dir → `split_NN` dirs → first-free split file → reference copy unless
present. Missing-reference items pause the batch behind a Skip/Continue
confirm (UI). Report `{ processed, skipped, failed, icons, interrupted,
batchPath, outputs }` → summary toast distinguishing empty/broken
(RULE 4). Group status JSONs rewrite after every item (resume-safe).

## 10. UI inventory (testids → `docs/current/UI_SELECTORS.md` §K–§Q)

Shell tab bar; FolderPickers (source/dest pickers, refresh, dest-mode);
PresetBar (list, name, save, save-as, load, delete, load-last); BatchSettings
(extensions, hash, padding, size, transparent, merge-auto, merge, output-dir,
variation-prefix, auto-select, keep-missing); ScanList (select-all,
deselect-all, rows); ScanRow (thumbnail, name, rel path, status badge,
checkbox, copy-path); ProcessBar (process, cancel, missing Skip/Continue,
progress); `batch-busy-overlay`, `batch-busy-message`, `batch-toast`.

## 11. Rule-compliance spot checks

- RULE 6: exports consume only selected, non-missing items; `collect`-style
  loops recheck selection at write time.
- RULE 10: one control per setting; fixed formats (`YYYY-MM`, …) have no
  controls (stored in presets, not editable).
- RULE 13: preset + status reads validated, corrupt → reject + defaults.
- RULE 15/23: gate before every write; unique names, no partial files.
- RULE 18/19: functions 4–20 lines ideal (hard ≤ 30), files ≤ 300, params ≤ 4,
  CC ≤ 10, nesting ≤ 4; remediation order nesting → CC → cognitive → size.
- RULE 20: all bytes stay local; object URLs revoked on rescan/unmount.
- RULE 24: reducer + props only, no cached copies; every control mirrors
  state on change.

## 12. TDD + verification plan

Red-green per module: `tests/batch/<module>.test.ts` first (real
`analyze`/`detect`/`renderIcon` via existing canvas-shim style + `toBlob`
stub; fake in-memory FS handles; `Image` stub for the decoder), then the
module. UI: thin components over tested flows; `tests/shell.test.tsx`
mounts `Shell` with `react` `act` (no new deps) for tabs + honest empty
states + picker-unsupported fallback. Lanes: `npx tsc --noEmit`,
`npm run lint`, `node tools/quality.mjs` (full; `--changed` degrades to full
on shallow checkouts — `tools/quality.mjs` robustness fix, same change),
`npx vitest run`, `npx vitest run --coverage`, `npm run build`; review lanes
`jscpd`/`knip`; record in `docs/current/QUALITY_RECHECK.md`.
