# System of Record — Icon Splitter

Current behaviour, invariants and flows. If code and this doc disagree, one of
them is wrong — fix the wrong one in the same change (AGENT_RULES RULE 17).
Adapted structure from `Process-Images-in-Areana/docs/current/SYSTEM_OF_RECORD.md`.

## 1. What this is

A browser app with two modes behind tabs (`src/ui/Shell.tsx`): a **sheet
editor** that detects individual icons in a sprite sheet, lets the user
review, resize and exclude them, and exports them as equal-size square PNGs —
ZIP download, folder save (Chrome/Edge File System Access), or clipboard; and
a **batch folders** mode that recursively scans a folder tree for `*_AI` icon
sheets, tracks per-reference status JSON files, and splits selected sheets
into a timestamped output tree. Both tabs stay mounted; the inactive tab is
`hidden` so state survives switching.

Stack: React 19 + Vite 7 + TypeScript + Tailwind 4, `jszip` for archives.
Production build is one self-contained `dist/index.html`
(`vite-plugin-singlefile`) that runs offline with no server (RULE 20).

## 2. Current behaviour (authoritative)

* Drop or choose image files (PNG/JPG/WEBP). Non-images are filtered with a message.
* Each sheet is analyzed (background colour, ink mask, threshold) and icons are
  detected automatically; merge distance is adjustable per sheet with an auto default.
* Detected boxes render over the sheet preview; clicking a box toggles exclude/include.
* Export: every included icon becomes a centred square (largest icon side +
  padding %), optionally transparent, optionally fixed size; delivered as ZIP,
  individual downloads, folder save, or single-icon clipboard copy.
* Everything runs client-side; nothing is uploaded anywhere.
* Batch mode: pick a root folder → recursive scan (ignoring `_split_output`)
  finds `*_AI.*` / `*_AI_<n>.*` sheets, links each to its `<base>.*` reference
  image, and keeps a `<base>.json` status file next to every reference base
  tracking processed / unprocessed / skipped / missing / changed / deleted.
* Batch review: thumbnail + name + rel path + status per row, checkboxes,
  Select all / Deselect all; missing files keep their last-known row but can
  never be selected. Output defaults to `<root>/_split_output`, or a custom
  destination folder; every run rescans first and writes
  `<dest>/YYYY-MM/YYYY-MM-DD_HH-mm-ss/<rel…>/<AIbase>/split_NN/<AIbase>_NN.png`
  plus a reference copy, never overwriting (duplicates get `_v02`, `_v03`…).
* Batch presets store folders + all settings in localStorage; the last-used
  preset is remembered and auto-loaded when the panel mounts.

## 3. State model

One in-memory model, owned by `App`:

```
sheets: Sheet[]       Sheet = { id, name, base, url, img, an: Analysis,
                                boxes: Box[], autoFrac, usedFrac, manual,
                                excluded: number[] }
activeId              which sheet is shown
padding, size, transparent   export options (ExportOpts)
busy: string | null   progress surface (RULE 5)
toast: {msg, err}     honest reporting surface (RULE 2, RULE 4)
```

Detection state transitions per sheet: `loaded → analyzed → detected(auto) →
[redetected(manual frac)…]`. `excluded` is a flag set over intact `boxes`
(RULE 11); only sheet removal destroys detection work.

Batch review state is a separate reducer model (`src/batch/reducer.ts`),
owned by `BatchPanel`:

```
folders: { source, sourceName, dest, destName, useCustomDest }
settings: BatchSettings   scan rules + split + naming + selection + duplicates
items: BatchItem[]        relPath, name, state, reference, note, thumbUrl;
                          source is null for missing rows (last-known state)
selected: string[]        relPaths; eligibility-constrained (RULE: missing /
                          deleted rows are never selectable)
tracked: Record<base, TrackedFile[]>   last-known scan state per reference
                          base, used to detect moved/renamed/deleted files
```

Scan transitions per file: `unprocessed → processed | skipped`; files that
vanish become `missing` (kept in the list when the setting is on, dropped
from selection); files whose size/mtime (or hash) changed become `changed`.
Deletion during processing is skipped safely, never a crash.

## 4. Core flows

* **Add sheets:** files → filter non-images → `loadImage` → `analyze` →
  `detect(an, null)` → sheet appended, first becomes active.
* **Review:** preview grid + SVG boundary overlay (`box-toggle-{i}`), merge
  slider re-runs `detect` with a manual fraction, `merge-reset` returns to auto.
* **Export all:** `collect()` loops sheets × included boxes → `renderIcon` →
  `canvasToBlob` (RULE 15 gate) → ZIP / sequential downloads / folder handles;
  `busy` reports `Rendering d/t…` per item (RULE 5); per-item failure is
  reported, never silently swallowed.
* **Single icon:** copy to clipboard or download one rendered blob.
* **Batch scan** (`scanFlow.runScan`): list files recursively → build items →
  reconcile against `tracked` (added/modified/moved/renamed/deleted) → write
  `<base>.json` status files → auto-select new eligible rows. Empty scans
  toast distinctly for “no images” vs “no eligible `*_AI` images” (RULE 4).
* **Batch review:** rows with thumbnails (object URLs, revoked on unmount),
  per-row Explorer action = copy `<root>/<rel path>` to clipboard (browsers
  cannot launch Explorer — RULE 9, RULE 4); when the clipboard is blocked the
  path is shown in an error toast instead of failing silently.
* **Batch process** (`processFlow.runProcess`): rescan → if references are
  missing ask skip-or-continue → split each selected sheet with the shared
  `analyze`/`detect`/`renderIcon`/`canvasToBlob` pipeline → write the output
  tree + reference copies → update status files. Cancel stops between files.
* **Batch presets** (`presetFlow`): save / save-as / load / delete / load-last
  over localStorage; corrupt or missing presets fail open with a message.

## 5. Invariants

* **I-1 (RULE 6):** every export contains exactly the currently included boxes
  of currently loaded sheets.
* **I-2 (RULE 4):** "no icons detected" and "image could not be read" are
  distinct honest states — never a fake success.
* **I-3 (RULE 11):** exclusion never destroys detection work.
* **I-4 (RULE 15):** a blob is delivered only after canvas dims > 0, blob
  non-null, size > 0; otherwise the item is skipped with an error.
* **I-5 (RULE 20):** image bytes never leave the browser.
* **I-6 (RULE 22):** export names derive from one function: sanitized sheet
  base + `-icon-NN.png`, deterministic detection order.
* **I-7 (RULE 24):** every visible value mirrors current state at the moment
  of change — no value waits for another interaction to become visible.
* **I-8 (batch):** batch output never overwrites an existing file — a taken
  name gets `_v02`, `_v03`… before the split number, preserving `_AI_7`.
* **I-9 (batch):** selection is eligibility-constrained — a sourceless
  (missing/deleted) row can exist in the list but never in `selected`, so the
  processor never receives a file that is already gone.
* **I-10 (batch):** “no images” and “no eligible `*_AI` images” are distinct
  honest scan results — never a fake empty success.
* **I-11 (batch):** status JSON files are the durable memory — scan and
  process both update `<base>.json` next to each reference base, so a later
  rescan sees moved/renamed/deleted files instead of forgetting them.

## 6. Storage map

* Sheet mode is memory-only. Object URLs from user files are revoked on sheet
  removal.
* Batch presets persist in localStorage: `iconsplitter.presets.v1` (named
  presets) and `iconsplitter.preset.last.v1` (last-used name). RULE 13
  applies: validate on read, reject corrupt payloads, atomic writes.
* Batch status files (`<base>.json`) live on the user's disk next to each
  reference base inside the scanned tree — written by scan and process.
* Batch thumbnails are object URLs revoked when the panel unmounts.

## 7. Key modules and layers

| Layer | Files | Owns |
|---|---|---|
| UI orchestration | `src/App.tsx`, `src/main.tsx`, `src/utils/cn.ts`, `src/ui/Shell.tsx` | state, controls, export paths, reporting, tabs |
| Batch UI | `src/ui/batch/*.tsx` | folders, presets, settings, review list, process bar (RULE 10 — one control per decision) |
| Batch flows | `src/ui/batch/scanFlow.ts`, `processFlow.ts`, `presetFlow.ts` | scan/process orchestration, no JSX |
| Batch domain | `src/batch/` (`naming`, `paths`, `status`, `presets`, `fs`, `scan`, `process`, `reducer`) | pure batch logic + File System Access boundary + review state |
| Detection | `src/lib/detect.ts` | `analyze` (mask), `detect` (boxes, auto radius, reading order) |
| Rendering | `src/lib/render.ts` | `squareInfo`, `cropRect`, `renderIcon`, `canvasToBlob` |

Direction: UI → flows → batch → lib, never upwards (RULE 1, RULE 3). Pixel
math stays in `src/lib/*`; batch calls `analyze`/`detect`/`renderIcon`/
`canvasToBlob`, never hand-rolls canvas math.

## 8. Tests — what exists and what must exist (RULE 8)

Exists (`tests/`, 107 tests, canvas shims serve synthetic pixels):

* `detect.test.ts` — box count, margins, radius merge/split, dust filter, reading order
* `analyze.test.ts` — background/threshold/mask/ink, transparency-as-white, downscale, analyze→detect end-to-end
* `render.test.ts` — squareInfo/cropRect geometry
* `render_icon.test.ts` — sizing/clamps, bg fill + neighbour wipe + restore, transparent pass, blob gate
* `tests/batch/` (84 tests) — naming/paths/status/presets/fs/scan/process/
  reducer units + `flows.test.ts` end-to-end (scan → reconcile → status →
  process → reducer over a fake FS with real `File`s; only picker, Image
  decode and toBlob are faked)
* `tests/shell.test.tsx` (6 tests) — tab switching, picker error toast,
  preset round-trip, invalid-setting revert, full scan → review → confirm →
  process run through the UI over a fake FS

Must exist before the matching change ships:

* any new exported lib/batch function → a test that fails if it is deleted
* sheet lifecycle (add/remove/exclude) → component tests using `UI_SELECTORS.md` handles when first needed
* ZIP/folder export → assertion on names + count (I-6), not just "no throw"

## 9. Quality gates summary (RULE 16 — thresholds frozen)

| Gate | Fail line | Tool |
|---|---:|---|
| Function LOC | > 30 | `tools/quality.mjs` |
| Params | > 4 | same |
| Cyclomatic complexity | > 10 | same + eslint warn |
| Nesting | > 4 | same + eslint warn |
| File lines | > 300 (warn), ratchet growth fails | same |
| Coverage `src/lib` | lines ≥ 80%, never decrease | vitest v8 |
| Anti-gaming | `partN` helpers always fail | same |

Workflow and ratchet: `CODE_VERIFICATION.md`. Dated re-checks: `QUALITY_RECHECK.md`.

## 10. History of designs — pointers

* 2026-09-30 — rules adopted from `marnikus/Process-Images-in-Areana`
  `docs/current/*` (AGENT_RULES 24 rules, CODE_VERIFICATION, DOM_SELECTORS →
  UI_SELECTORS, QUALITY_RECHECK); metrics reports intentionally not ported.
* 2026-10-01 — `docs/archive/2026-10-01-batch-folders/DESIGN.md`: recursive
  batch folders, review, presets, output tree (shipped same day; scan reading
  “`flows.ts`” predates the RULE 18 split into
  `scanFlow.ts`/`processFlow.ts`/`presetFlow.ts` — archive docs are never
  edited, the split is recorded in QUALITY_RECHECK).

## 11. Current UI — control inventory

Full handle reference with semantic fallbacks: `UI_SELECTORS.md`.
Tabs: Sheet editor — header (upload + 3 export buttons), Sheets, Export
settings (padding/size/transparent), Detection (merge slider + reset),
Boundary overlay, Result grid, busy overlay, toast. Batch folders — Folders
(source/rescan/destination), Presets, Batch settings (scan rules, split,
naming, selection), Review list, Process bar, busy overlay, toast.
