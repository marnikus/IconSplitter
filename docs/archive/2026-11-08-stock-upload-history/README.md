# Upload history for the Upload tab — plan (no code yet, 2026-11-08)

**Request, as given:**

> each upload to every stock should store a history of uploaded batches for every
> stock separately. add "upload history" btn control. it pop up win with drop
> list of stocks. selecting stock give a list of batches that was uploaded with
> num of files was uploaded. date of upload. each this batch can be open also on
> click and shows a list of all images was uploaded in this batch — narrow lines
> (30px) of items with very small preview (pop up image preview bigger on click
> on thumbnail), name of file, location button (store the file full path to file
> as it uploaded of stock …). add btn "select all files" — it selects all files
> in this batch in current list of item that opened. if this files avaliable in
> this current list it select all this files.

**Target tab:** `Upload` (`src/stockupload/`, FTPS/SFTP/Getty ESP uploader). The
"SVG to upload" tab is **not** in scope; its own export history is unrelated.

## Documents

| File | Role |
|---|---|
| [SPEC.md](SPEC.md) | Behaviour contract: entry point, dialog levels, exact copy, row anatomy, selection semantics, state table, open questions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data model, storage split (localStorage index + IndexedDB file lists, DB v5), capture lifecycle, 3-tier matching to the current list, module map with RULE 16 budgets, risks |
| [STEPS.md](STEPS.md) | 11 ordered TDD steps, each with its failing test file, gates and definition of done |

## The one-paragraph version

The Upload tab already funnels every file of every protocol through
`recordTaskResult` (`src/stockupload/statusflush.ts`) but keeps only each item's
**latest** status per stock. The plan adds a second, append-only archive: one
**batch** per run per stock (run id + target), holding counts, the frozen root
path snapshot and one record per uploaded file (name, relative path, format,
status, reason, 100-icon chunk). Persistence is split — a small validated index
in `localStorage` read synchronously at boot, the per-file lists in a new
IndexedDB store (DB version 4 → 5, additive) read only when a batch is opened.
A new `Upload history` button opens a modal: stock dropdown → batch list (file
count + local upload date + outcome chip) → 30 px file rows with a live thumbnail
and a bigger preview popover, a `Location` button copying the frozen absolute
folder path, and `Select all files`, which maps the batch's files back onto the
current list (three-tier matcher; id, anchored path, path suffix — ambiguity
never guesses), checks them through the existing `stockUploadChecked` undo
entry, and reports how many batch files were not in the list at all.

## Decisions taken by default (SPEC §8 lists them as questions)

| # | Question | Default in this plan |
|---|---|---|
| 1 | Does `Location` copy the folder or the file path? | **Folder** path with backslashes (matches the example, keeps invariant I-28/I-56). The full file path stays in the row `title` and the popover. |
| 2 | Is a batch one run per stock or one 100-icon chunk? | **One run per stock**; the chunk number is shown per file. |
| 3 | Previews with no folder open? | **Live resolution only**, format badge + honest note otherwise. No image bytes stored. |
| 4 | `All stocks` option? | **Yes**, as the default view; the dropdown still filters to one stock. |
| 5 | Archive failed / no-credential runs? | **Yes** — a run that attempted files is recorded with real outcomes. |

## Non-goals (v1)

* "Re-upload this batch" or restoring a batch into the tab's selection as a
  pending run (the archive will already carry everything needed; ship it later).
* Clearing individual batches, exporting history to a file, cross-browser sync.
* Any change to how uploads are planned, transferred or badged.

## Read next

Start at [AGENTS.md](../../AGENTS.md), then the router's **Upload (FTPS)** row in
[current/README.md](../../current/README.md). This folder is history: once the
feature ships, the owning pages are `docs/current/sor/stock-upload-history.md`
and `docs/current/selectors/stock-upload.md`, per RULE 17.
