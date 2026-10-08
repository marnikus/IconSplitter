# SVG to upload — "Download all" (2026-10-08)

## 1. The ask

> to SVG to upload add the button **Download all**. It downloads all prepared
> exported files with SVG, EPS and JPG to a folder selected by the user (a
> popup explorer window to choose the folder to save). All selected items in
> the list will be saved to this folder.

Today every committed package lives beside its source, one `export/` folder per
pair (`architecture/fog/export/fog.svg|jpg|eps` + `export.json`). Handing the
set to a stock site means walking N folders by hand. The user wants ONE folder
with every artifact of the selection in it.

## 2. Decisions

* **D1 — scope is the selection.** The button reads `⤓ Download all (N files)`
  where N is the number of committed artifacts the selected rows' records name;
  disabled at 0 selected. "All" means every prepared file of every selected
  icon — not every row in the list (the user's last sentence).
* **D2 — the destination is the browser's folder picker**
  (`showDirectoryPicker({ mode: "readwrite" })` through `batch/picker`'s
  `pickDirectory`). It is a destination, not a root: no clipboard path capture,
  no remembering, no scan. Cancel → one quiet toast, nothing written.
* **D3 — what is copied: what the record names and the disk has.** For each
  selected row with an `export.json`, the `outputs.svg/jpg/eps` entries that
  exist on disk are read as bytes and written into the destination's top level
  under the artifact's own name (`fog.svg`, `fog.jpg`, `fog.eps`).
  `export.json` is not copied (the user named the three artifacts). A row with
  no record is "not exported yet" and counted, never guessed at.
* **D4 — never overwrite (RULE 23).** `writeFileNew`: a name already in the
  destination is KEPT and counted (`kept`). Two selected icons whose stems
  collide (`fog` in two folders) keep their packages apart: the second takes
  `fog (2).*` — all three artifacts of one icon share the suffix so the package
  stays together. Assigned by a pure planner, so the UI count and the write
  agree.
* **D5 — verified copy, per-file isolated (RULE 5/23).** Each write is read
  back and compared (length + sha256) to the bytes read from the source; a
  mismatch removes the bad file and counts `failed`. One file's failure never
  stops the next. Sequential; local; the busy line says "Downloading…".
* **D6 — one honest line, one log entry.** Toast: `Saved 9 files (3 icons) to
  <folder> · 2 kept (already there) · 1 icon not exported yet · 1 failed` —
  parts appear only when non-zero. Log: new closed-set action `downloaded`
  (`downloadedSpec`), counts spelled in the detail, no `data`.

## 3. Owner files

| File | Owns |
|---|---|
| `src/lib/upload/download.ts` (new, pure) | `planDownload(rows)` → items `{id, base, from, to}` + `notExported`; `downloadLine(result, folder)` |
| `src/upload/downloadactions.ts` (new) | `useDownloadActions` → `downloadSelected(ids)`: guard, pick, `copyPlanned`, toast + log |
| `src/upload/uploadlog.ts` | `downloaded` action + `downloadedSpec` |
| `src/upload/UploadBulkBar.tsx`, `UploadPanel.tsx`, `actions.ts` | the button, its count, the wiring |

## 4. TDD steps

1. `tests/upload_download.test.ts` — the planner: names, collisions, no record, missing kinds; the line.
2. `tests/upload_uploadlog.test.ts` — `downloaded` joins the closed set.
3. `tests/upload_download_ui.test.tsx` — the button's count, the picker, files in the destination byte-for-byte, kept/not-exported in the toast, cancel writes nothing.
4. SOR row, UI_SELECTORS, README row, QUALITY_RECHECK entry; `npm run verify`.
