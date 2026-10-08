# SVG to upload — "Download all": the selected packages into one folder (2026-10-08)

## 1. What the user asked for

A **Download all** button on the "SVG to upload" tab. It copies the prepared, exported files (SVG, EPS and JPG) of **every selected icon** into a folder the user picks in the browser's own folder dialog.

## 2. Decisions (taken with the user, 2026-10-08)

* **D1 — the button is in the bulk bar, beside Export selected.** It acts on the CHECKED icons only, whatever the filters hide, and is disabled at 0 checked (like the other bulk actions).
* **D2 — the folder dialog is the browser's own `showDirectoryPicker` (readwrite).** No picker is invented. Cancelling saves nothing and says so. A browser without the API gets an error toast that names Chrome or Edge (RULE 4), never a silent dead end.
* **D3 — flat layout (the user's choice).** Every file goes straight into the chosen folder under its export name: `fog.svg`, `fog.jpg`, `fog.eps`. The files are the ones the icon's `export.json` records as committed — the same bytes the export folder holds, read back from the disk.
* **D4 — nothing is overwritten (RULE 23).** A name that the chosen folder already holds, or that an earlier icon of the same batch has taken, is numbered AS A WHOLE PACKAGE: `fog_2.svg`, `fog_2.jpg`, `fog_2.eps`. The comparison ignores case (Windows folders). The numbering is reported in the toast.
* **D5 — only prepared packages are copied.** An icon with no committed package is skipped and named in the toast; this button never exports. A stale package (its source or settings changed since the last export) is copied as it stands and counted in the toast, so the user knows to re-export.
* **D6 — every outcome reaches the log**, one entry per icon, through the closed upload vocabulary (`downloaded`, RULE 2). The entry names the icon, the folder name and the outcome; it carries no data.

## 3. Owner files

| File | Change |
|---|---|
| `src/upload/downloadplan.ts` (new, pure) | which committed file goes where: `planDownload`, the package-wide numbering, the summary line |
| `src/upload/downloadactions.ts` (new) | the action: guard, picker, read the export folder, write with `writeFileNew`, toast + log |
| `src/upload/uploadlog.ts` | the closed vocabulary gains `downloaded`; `downloadedSpec` |
| `src/upload/actions.ts` | `downloadSelected` on the action surface (wiring only — the file is at its ceiling) |
| `src/upload/UploadBulkBar.tsx`, `UploadPanel.tsx` | the `upload-download-all` button and its prop |

## 4. Invariants (SoR I-59)

Written in SoR §"Download all". The copies are read-only with respect to the export folder and the approved sources: nothing in the source tree or in `export/` changes.
