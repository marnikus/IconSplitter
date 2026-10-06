# Design — Recursive Batch Processing, Selection, Presets, Output Organization

Date: 2026-10-01. Status: implementing (TDD). Rules: AGENT_RULES 1–24, esp. 16/18.

## 1. Environment constraint (honesty first, RULE 4 / RULE 20)

Icon Splitter is a browser app. The File System Access API (`showDirectoryPicker`,
Chrome/Edge) gives recursive directory read/write — enough for the whole feature.
Two OS-level asks cannot work in any browser and get honest substitutes:

* **"Open in File Explorer (select file)"** → no browser API exists. Substitute:
  copy `<root>/<relPath>` to clipboard + toast naming the limitation (RULE 9 fail-open).
* Handles don't survive restarts by path → persisted via IndexedDB
  (`FileSystemDirectoryHandle` is structured-cloneable); permission re-requested on use.

## 2. Module map (RULE 1, RULE 18: one responsibility per file, 150–300 lines)

Pure core (unit-tested, no browser APIs):

| Module | Owns |
|---|---|
| `src/lib/naming.ts` | `_AI`/`_AI_N` parse, reference name, split folder/image names, variation suffix, batch path `YYYY-MM/YYYY-MM-DD_HH-mm-ss` |
| `src/lib/scan.ts` | tree walk (ignores `_split_output`), eligibility filter, reference linking, scan diff (added/changed/kept/missing) |
| `src/lib/statefile.ts` | per-reference JSON model + merge + validate/reject (RULE 13) |
| `src/lib/presets.ts` | preset model, defaults, validate/reject |
| `src/lib/output.ts` | batch planning: month/timestamp layout, collision → `_v02…` allocation (pure) |

Adapters (thin, structural fakes in tests where possible):

| Module | Owns |
|---|---|
| `src/lib/fs.ts` | dir/file probes (create:false), no-overwrite writes (RULE 23), tree read, hash |
| `src/lib/batchsplit.ts` | one source file → PNG blobs via detect/render pipeline (RULE 1) |
| `src/batch/store.ts` | presets in localStorage, handles in IndexedDB |
| `src/lib/dom.ts` | `loadImage` / `download` extracted from App.tsx (App shrinks — ratchet-safe) |

UI (new files; `App.tsx` gains **zero** lines, RULE 16.5):

| Module | Owns |
|---|---|
| `src/ui/Workbench.tsx` | Sheets / Batch tab switch (rendered from `main.tsx`) |
| `src/batch/BatchPanel.tsx` | root pick, scan view, selection, process orchestration |
| `src/batch/ScanTable.tsx` | rows: thumbnail, name, relPath, status badge, checkbox, actions |
| `src/batch/PresetBar.tsx` | preset list/save/load/delete/last |

## 3. Key decisions

* **Eligibility:** `/^(.+)_AI(?:_(\d+))?(\.\w+)$/i` on image extensions; reference =
  same dir, `base + ext`; reference itself never processed; missing reference =
  warning + user may skip or continue (processing then skips the ref copy, RULE 9).
* **Identity:** relPath + size + mtime; optional SHA-256 (`useContentHash`) — RULE 6:
  only records passing current scan stay selectable; missing kept in JSON as
  `missing` (scan) or `deleted` (gone between scan and process; skipped safely, batch continues).
* **No overwrite:** every dir/file creation probes `create:false` first; collision →
  `_v02, _v03…` appended to the source-derived folder name (existing `_AI_7` untouched).
* **JSON:** one `<base>.json` beside the reference, rewritten after every scan and
  after every processed source (resume-safe, RULE 13 validates on read).
* **Selection:** UI Set over relPaths; Select All / Deselect All; preset default
  (`all|none|remember`).
* **Cancel:** per-item flag check in the batch loop (RULE 7); per-item failure
  isolated + reported, loop continues (RULE 5).

## 4. TDD order

naming → scan → statefile → presets → output plan → fs (structural fakes) →
store → batchsplit → UI wiring. Each: red test, green implementation, gate clean.

## 5. Rule budget checked up front (RULE 16.6)

* Every new function targets ≤ 20 LOC (fail 30), ≤ 4 params, CC ≤ 10, nesting ≤ 4.
* New files target 150–300 lines; none may exceed 300 (gate fail line for new files).
* `App.tsx` (606 lines legacy) must not grow → helpers move out (net shrink), UI mounts via `main.tsx`.
