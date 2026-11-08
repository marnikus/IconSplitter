# SPEC — "Upload history" for the Upload (stockUpload) tab

Status: **contract only, nothing implemented yet** (2026-11-08).
Owner tab: `Upload` (`src/stockupload/`, tab id `stockUpload`) — *not* "SVG to upload".
Companions: [ARCHITECTURE](ARCHITECTURE.md) · [STEPS](STEPS.md).

## 1. Purpose and scope

Every run of the Upload tab sends files to one or more stock sites. Today the app
remembers only the *latest* status of each item per stock
(`iconSplitter.stockUpload.history.v1`), so a question like "what did I send to
Shutterstock last Tuesday, and where did those files come from?" has no answer.

This feature keeps an **append-only archive of upload batches per stock** and
exposes it in one dialog:

* a button `Upload history` in the tab's source toolbar;
* a modal with a **stock dropdown** → **list of batches** (file count + upload date)
  → **list of the files that batch uploaded** (30 px rows, tiny preview with a
  bigger preview popover, file name, `Location` button carrying the absolute
  folder path the file was uploaded from);
* a `Select all files` control that checks the rows of the **current list** that
  belong to the open batch, and reports honestly what it could not find.

Scope rules: the archive is **local-only** (browser store), never sent anywhere;
it stores metadata and paths, never credentials, prompts, metadata text or image
bytes. It is independent of the folder currently open — you can read yesterday's
history with no folder picked.

## 2. Vocabulary (used verbatim in code and docs)

| Term | Meaning |
|---|---|
| **Run** | One press of `⇪ Start Upload`: `runId` (`crypto.randomUUID()`), one root, one plan. |
| **Stock / target** | One `StockFtpPreset` (`targetId`, `targetName`). A run with three checked targets writes **three** batches. |
| **Batch** | One run × one stock. The unit listed in the dialog. |
| **Chunk** | The 100-icon transfer batch the runner already uses inside a run (`Shutterstock batch 2/3`). Optional per-file field, not a list level. |
| **File** | One planned transfer (one format of one icon, or its ZIP). |

A batch is **not** a 100-icon chunk; a 300-icon Getty run is one batch with
`chunk` 1–3 on its files. (Open question Q2 in §8.)

## 3. Entry point

In `SourceBar` (`StockUploadControls.tsx`), after `↻ Rescan`:

* button label **`Upload history`**, `data-testid="stock-history-open"`,
  always enabled (including before a folder is picked), title
  `Every upload, per stock, with the files it sent`.
* no badge/count on the button; the dialog owns the numbers.

## 4. Dialog — level 1: stock → batches

Backdrop + `svg-modal wide` (existing styles), `role="dialog"`, `aria-modal`,
Esc and the header `Close` button both close. `data-testid` values:

| Element | testid | Notes |
|---|---|---|
| backdrop | `stock-history-backdrop` | click closes |
| modal | `stock-history-dialog` | `aria-labelledby="stock-history-title"` |
| title | `stock-history-title` | text `Upload history` |
| close | `stock-history-close` | `Close` |
| stock row | `stock-history-target-row` | label `Stock` |
| stock select | `stock-history-target-select` | see below |
| batch list | `stock-history-batches` | |
| one batch | `stock-history-batch-<batchId>` | button row |
| empty state | `stock-history-empty` | |

### 4.1 Stock dropdown

Options, in preset order, then any archived target whose preset was deleted
(grouped last, label suffixed `(preset removed)`):

1. `All stocks (N)` — default when more than one stock has history.
2. `<name> — <n> batch(es)`, `n` = archived batches for that target.
3. `<name> — no uploads yet` (disabled) for every current preset with no batches.

Selecting a stock filters the list to that `targetId`. The choice is remembered
for the session only (`model.historyTargetId`), never persisted.

### 4.2 Batch row anatomy (one line, ~34 px)

```
2026-11-08 14:22  Shutterstock                212 files · 106 icons · 3 failed   partial ▸
```

* date/time: batch `startedAt`, displayed in **local** time as `YYYY-MM-DD HH:mm`.
* stock name: only in `All stocks` mode.
* counts: `N file(s)` = files recorded as uploaded; `M icon(s)` = distinct items;
  `K failed` only when K > 0; when the run used the `Limit` chip add
  `· limit 106 of 300`.
* outcome chip: `complete` | `partial` | `failed` | `stopped` | `interrupted`
  (colour: green / amber / red / grey / grey).
* `▸` opens level 2. The whole row is a `<button>`; Enter/Space opens.

Order: newest first. Cap the rendered list at the newest 200 rows with a footer
note `Showing the latest 200 of N batches` (retention is bounded anyway).

### 4.3 Empty states (RULE 4 — empty is an answer, not an error)

| Situation | Copy |
|---|---|
| no batches at all | `No uploads recorded yet. The first upload you run will appear here.` |
| stock filter, no batches | `No uploads recorded for <stock> yet.` |
| store blocked (private mode) | `History cannot be saved in this browser session — uploads still run, but nothing will be remembered.` (toast, not a crash) |

## 5. Dialog — level 2: the batch's files

Opens inside the same modal (`stock-history-detail`), keeps level 1 behind a
`‹ Back` control (`stock-history-back`).

Header block:

* `stock-history-detail-title` — `<stock> · <YYYY-MM-DD HH:mm>`
* summary line `stock-history-detail-summary` —
  `212 of 212 file(s) · 106 icon(s) · 3 failed · complete`
* `stock-history-detail-root` — the captured root folder path in `<code>`,
  Explorer backslashes, ellipsis + `title` for overflow, e.g.
  `F:\Stocks 2026\icons testing\single\test_process_6\_split_output\2026-11\2026-11-01\asset 1\download-icon-06_AI\split_03\export`.
  When the run's root path was not captured:
  `Full path not captured for this upload` + `title`
  `The browser never received the folder path — pick the folder and Rescan to capture it next time.`
* action bar: `Select all files` (`stock-history-select-all`) and the result note
  `stock-history-select-result`.

### 5.1 File row (exactly 30 px high)

```
[22px thumb] download-icon-06.jpg   JPG   ✓   [⧉ Location]
```

| Element | testid | Behaviour |
|---|---|---|
| row | `stock-history-file-<n>` | `n` = 1-based position in upload order; `title` = full file path |
| thumbnail | `stock-history-thumb-<n>` | 22×22; click opens the preview popover |
| name | `stock-history-name-<n>` | file name only, ellipsis, `title` = full path |
| format | `stock-history-format-<n>` | `JPG`/`PNG`/`SVG`/`EPS`/`ZIP` |
| status | `stock-history-status-<n>` | `✓` uploaded, `✕ failed` with `title` = reason |
| location | `stock-history-location-<n>` | copies the folder path, see §5.3 |
| chunk (only if >1 chunk) | `stock-history-chunk-<n>` | `2/3` |
| truncated note | `stock-history-files-truncated` | `Only the first 2000 files of this batch are stored.` |

A sticky sub-header (30 px) shows `File · format · status · location` and, in
`All stocks` mode, nothing else. Files are listed in upload order; chunks are
not collapsed.

### 5.2 Thumbnail and preview popover

* The thumbnail is **resolved live, nothing is stored**: use the current list's
  row for the same icon if it matches (§6), else read the file from the
  currently open root **only when** the batch's captured root path equals the
  current root's captured path; otherwise show a neutral format badge
  (`JPG`, `SVG`, `EPS`, `ZIP`).
* Click on the thumbnail opens `stock-history-preview` — a 320 px box anchored
  to the row with the image, file name, format, status and the full path, plus
  `Close`. Esc or a backdrop click closes it. One popover at a time.
* Unavailable file: the popover shows the same layout with
  `File not available — open the folder that contains it.` and the full path
  when one is stored. Never a broken-image icon.
* Accessibility: thumbnail is a `<button>` with `aria-label="Preview <name>"`;
  the popover has `role="dialog"` and moves focus into itself.

### 5.3 `Location` button

Copies an **absolute folder path** with backslashes — the folder the file lived
in, exactly as in the user's example (which ends at `…\export`), never a
browser-relative path:

```
<captured root path>\<relDir of the file>      e.g. F:\…\split_03\export
```

* composed from the batch's **frozen** root path snapshot + the file's `relPath`;
  a later re-capture of the same folder never rewrites old history.
* success toast `Copied folder path`; clipboard refusal `Clipboard blocked — copy the path from the title`.
* when no absolute path was captured: button disabled with title
  `Full path was not captured for this upload`.
* the complete file path (`…\export\download-icon-06.jpg`) is always in the
  row's `title` and in the preview popover, so it stays copyable even when the
  location button is off. (Open question Q1 relates to this.)

## 6. `Select all files` — selection semantics

* The button selects **the rows of the current list** (`g.items`) whose id is
  among the items of this batch; each icon counts once even when the batch sent
  a JPEG and an EPS.
* Toggle, like the bulk bar's `stock-check-all`: when every matched row is
  already checked, the button unchecks them instead. Label switches to
  `Deselect all files` in that state.
* Scope is the **whole list**, not the filtered view. The note says so:
  `Selected 118 of 200 icon(s) from this batch · 82 not in the current list · 14 hidden by filters.`
  (hidden count only when > 0; `not in the current list` covers "different
  folder" and "no folder open").
* Zero matches: `None of this batch's files are in the current list — open the folder they were uploaded from.`
* Exactly one history action is pushed: `stockUploadChecked`, label
  `Select batch files`, so the global undo timeline restores the previous
  selection in one step. A no-op selection pushes nothing.
* The dialog stays open after selecting; the count in the note and the tab's
  `stock-selected-count` both move.
* Keyboard: `S` inside the detail view triggers the same action when focus is
  not in an input. The button is described by its note (`aria-describedby`).

## 7. States, gates and persistence summary

| Aspect | Contract |
|---|---|
| while a run is in flight | the current batch is already visible with status `running`; counts update at chunk boundaries |
| run cancelled | status `stopped`, counts frozen at what was attempted; `planned` count still shown |
| app closed mid-run | on next boot status `interrupted` (never auto-resent) |
| no credentials for a target | batch recorded with every planned file `failed`, reason `No saved credentials for <stock>` |
| empty run (0 files) | no batch written |
| storage key — index | `iconSplitter.stockUpload.batchHistory.v1` (localStorage, validated on read) |
| storage key — file lists | IndexedDB `iconSplitter` store `stockUploadBatchFiles`, key `<batchId>` (schema in ARCHITECTURE §4) |
| retention | 100 batches per stock, 300 total, 2000 files per batch, oldest pruned first |
| undo | only the selection action is undoable; the archive itself is append-only |
| log | unchanged (the run's existing log lines stay the trail) |

## 8. Open questions (need a decision before implementation)

1. **Location copies what?** Spec assumes the invariant-compatible behaviour:
   folder path (I-28/I-56, and it matches the example path). If you want the
   button to copy the **file** path (`…\export\download-icon-06.jpg`), that
   changes an existing invariant and needs its own doc decision.
2. **Batch = run-slice or 100-icon chunk?** Spec lists one batch per run per
   stock (chunk shown per file). Chunk-level batches would multiply rows by
   three on big runs.
3. **Previews without a folder open**: spec resolves thumbnails live and shows a
   format badge when nothing is reachable. Storing a 64 px thumbnail per icon
   would make previews always available at ~2 KB × icons per batch — do you want
   that cost, or the honest placeholder?
4. **`All stocks` option** in the dropdown: keep it (recommended, it is the only
   way to see recent activity across sites) or strictly one stock at a time?
5. **History for failed/no-credential runs**: keep them (honest, debuggable) or
   archive only runs that uploaded at least one file?
