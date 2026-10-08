# SVG to upload — "Download all" (design, 2026-10-08)

## 1. The request

The user asked for a **Download all** button on the SVG to upload tab. It saves
the prepared export files — SVG, JPG and, where the package has one, EPS — of
**every selected icon** into **one folder the user chooses** in the native
folder dialog ("popup explorer window to choose folder to save").

Nothing in the tab can hand files to the user's disk today: the export package
lives in `<pair>/export/` inside the picked root, and the only outward action is
a copy of the folder's path (Location).

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | The button is in the bulk bar, beside **⇪ Export selected**: `upload-download-all`, label `⤓ Download all (N)`. N = checked icons with a finished package. | The bulk actions already live there and act on the selection (RULE 10/24). |
| D2 | It acts on the **checked** selection (`app.upload.checked`), not the filtered view. | "All selected items in list" — the same scope as Export selected and Generate metadata. |
| D3 | An icon is ready when its row is **processed** or **partial**, has a record, is **not stale** and **no run is working on it**. Anything else is skipped with its reason: `not-exported`, `stale`, `unfinished` (failed / cancelled / interrupted), `running`. | The row's own status is the authority (RULE 4). Skipping is success-with-note (RULE 9). |
| D4 | Per icon, the files are the record's `outputs`: **svg** and **jpg** always; **eps** only when the record says the package was exported with EPS on (`tools.eps.enabled`). An EPS the record names but whose package was exported with EPS off is **not** delivered — it may be left over from an earlier export and no longer match the SVG. | A package is what its last export says it is. |
| D5 | A partial package (EPS stage failed) delivers its SVG and JPG and reports the EPS as **missing**. A package exported with EPS off reports **"without EPS — EPS export is off"** as a note, not an error. | Honest per file; the user learns what to do (RULE 4). |
| D6 | **Only verified bytes are delivered (RULE 15, fail closed).** Each file is read from the package and must match the record's `bytes` and `sha256:` hash, and be non-empty. Otherwise it is missing: "missing, changed or not produced — export again". | A file edited or lost since its export is never shipped as the export. |
| D7 | **Destination names**: flat folder, base = `stemOf(svgName)` (the name the package uses). The whole trio shares one stem. On collision the stem moves to `withVariation(stem, v)` (`_v02`, `_v03`, …) so `fog.svg`, `fog.jpg`, `fog.eps` stay together. Collisions are checked **case-insensitively** against the folder's listing and the names reserved earlier in the same run. | RULE 22 (traceable names), RULE 23 (never overwrite). Case folding protects Windows and macOS folders. |
| D8 | Every written file is created **only if its name is free** (`createNew`). If writing fails after the file was created, that partial file is removed. After writing, the copy is **read back** and must match size and hash, or it is removed and reported. | RULE 15/23. A failed write never leaves a half file that looks delivered. |
| D9 | The folder dialog opens **only after the guards pass and the plan has something to save**, and it is called **synchronously** inside the click (before any `await`). A cancelled dialog saves nothing and says so. The chosen folder is **not remembered**. | No dialog for a click that cannot succeed. User activation is preserved. No new storage (RULE 13). |
| D10 | The run is sequential, one icon at a time. Each icon's failure is isolated: the other files and icons continue. Progress is dispatched per icon (`progress`, and the busy line "Saving 2 of 5 · fog…"). Between icons the loop yields to the UI. | RULE 5. |
| D11 | **Cancel** reuses the bulk bar's **Cancel run** button (`upload-cancel-run`). It routes to the download's own abort ref while a download runs. A cancel takes effect between icons; saved files are kept. | RULE 7. The metadata/export cancels are unchanged. |
| D12 | A run is **one log entry** (`downloaded`, a new member of the closed `UPLOAD_LOG_ACTIONS` set). Its level is `error` when nothing was saved or a file failed, `warn` when something was missing or the run was stopped, otherwise `info`. The toast carries the same sentence. | RULE 2, RULE 4; the log vocabulary stays closed (`upload_uploadlog.test.ts`). |
| D13 | Nothing is exported, nothing is sent to a provider, nothing is paid for, and the package folder and the approved SVG are **never written**. Downloads are not on the undo timeline: the app changes no state the undo bar could reverse. | The user's scope: "downloads what is prepared". |
| D14 | Unsupported browsers (no `showDirectoryPicker`) get the honest sentence "Saving to a folder needs Chrome or Edge", before any dialog is attempted. | RULE 4. |

## 3. Module map

| Module | Owns | Kind |
|---|---|---|
| `src/lib/upload/download.ts` | `planDownload`, `verdictOf` rules, `allocateStem`, `matchesCommitted`, `skipPhrase`, `summarizeDownload`, the run result type | pure (no browser API) |
| `src/upload/downloadrun.ts` | `runDownload`: read, prove, allocate, `createNew`, readback, removal, per-icon isolation, cancel | I/O over `DirHandleLike` |
| `src/upload/downloadactions.ts` | `useDownloadActions` (`downloadSelected`, `cancelDownload`), guards, folder pick, progress, log, toast; `downloadReadyCount` for the bar | hook |
| `src/upload/uploadlog.ts` | `downloaded` action and `downloadedSpec` (the only log writer) | pure |
| `src/upload/statemodel.ts` | `runningDownload`; `running` action accepts `kind: "download"` | reducer |
| `src/upload/types.ts`, `useUpload.ts`, `actions.ts` | `abortDownload` ref, `downloadReady` in the derived values, the action surface | wiring |
| `src/upload/UploadBulkBar.tsx`, `UploadPanel.tsx` | the button, the progress kind, the single Cancel routing, the status line | UI |

The row model is reused as is: `stemOf` and `ARTIFACT_EXTS` from `lib/upload/export`,
`readBytesAt` from `runexport`, `sha256Hex` from `lib/upload/hash`, `withVariation`
from `lib/naming`, `listChildNames` / `nameExists` / `DirHandleLike` from `lib/fs`,
`pickDirectory` / `fsSupported` from `batch/picker`.

## 4. The summary sentence

`summarizeDownload(folder, plan, run)` joins the parts that apply with ` · `:

* `Saved 6 files from 2 icons to “Stock”` (or `Nothing was saved to “Stock”`);
* `2 skipped (1 not exported, 1 changed since export)`;
* `2 without EPS — EPS export is off in Export settings`;
* `1 missing, changed or not produced — export again`;
* `1 renamed to avoid a clash`;
* `1 could not be written`;
* `stopped after 2 of 5`.

When no icon is ready, the guard says it before any dialog:
`None of the 2 selected icons has a finished package (1 not exported, 1 changed since export) — export them first.`

## 5. Test plan (red first, RULE 8 — real logic)

* `tests/upload_download_plan.test.ts` — the verdicts (every skip reason), EPS
  states (included / missing on a partial / off, and a leftover EPS not
  delivered), stems, `allocateStem` (the trio, case folding, the next free
  variation), `matchesCommitted` (size, hash, empty), the sentence.
* `tests/upload_download_run.test.ts` — over `BinDir` fakes with real export
  bytes: byte-identical copies under the stem; no overwrite of a user's file (the
  whole trio moves to `_v02`); a clash on one name moves the trio; a changed
  file and a missing file are not delivered and the others are; per-icon
  isolation on a write failure and on an unexpected error; a short write is removed and reported; a cancel
  between icons keeps what was saved; progress once per icon; no partial file
  left behind.
* `tests/upload_uploadlog.test.ts` — the closed set gains `downloaded`, and the
  builder is in the emitted-set test.
* `tests/upload_ui.test.tsx` (describe "Download all") — the real panel: the
  count, the picker not opened when nothing is ready, a cancelled picker, a
  download of two exported icons into a stubbed folder (bytes equal to the
  packages, toast, one log entry, no provider call), EPS on, a settings change
  that leaves one package stale (its sibling still lands; the guard and the
  summary name it), every selected package stale (no dialog), and Cancel run
  stopping a download between icons. The stale and EPS cases export the second
  icon from its own folder: two icons in one folder share `export.json` (§6).

## 6. Non-goals and known limits

* Downloading never exports. An icon that is not ready is skipped and named.
* Downloading the same selection twice into the same folder creates `_v02`
  copies. That is the no-overwrite rule (RULE 23), not a bug; the user may delete
  the copies in the folder dialog.
* The folder is picked each time. Nothing about the destination is stored.
* Browsers without the File System Access API (`showDirectoryPicker`) cannot use
  the feature; the panel already shows its Chrome/Edge notice in that case.
* **Found while testing, pre-existing, not changed here:** the export record is
  written to `<folder>/export/export.json` — one file per SOURCE FOLDER — while
  `docs/current/SYSTEM_OF_RECORD.md` §6 says one record per icon. `rowmodel`
  reads that one file for every icon in the folder. Two icons exported from one
  folder therefore share the file: the last one written wins. Until a rescan or a
  reload, the rows keep their own records, so downloads are correct. After one of
  them only that last icon keeps a record; the others show Stale and are skipped as "changed
  since export" (their files on disk are not changed, and the download does not
  deliver bytes it cannot prove against a record, RULE 15). The fix is a per-icon
  record name (for example `export/<stem>.json`) with a migration of existing
  folders. That changes the export commit, the scan and the sweep, so it is a
  separate change with its own decision, not part of this one.
* The invariant is **I-59**. I-57 and I-58 are reserved by the design-only keep-alive
  plan (`docs/archive/2026-10-08-svg-queue-keepalive/`).
