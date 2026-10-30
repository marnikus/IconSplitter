# Getty web upload — batches, parts and the re-upload list

Parent: [stock-upload-getty-web](stock-upload-getty-web.md). Invariant
[I-82](invariants/upload.md#i-82).

## 1. One batch is at most 100 icons

Getty takes at most **100 uploads per batch**, and one **icon** — its JPEG plus
its matching EPS — is one upload, because Getty lists the pair once under the EPS
name. So the number that must never exceed 100 is the **icon count**, not the
file count: 100 pairs (up to 200 physical files) are one batch, 101 icons are
two. `GETTY_WEB_MAX_BATCH_ICONS = 100` and the helper's `MAX_ICONS = 100` must
agree; `planGettyWebBatches` splits the run in order, and because the chunk unit
is the pair, a JPEG can never land in a different batch from its EPS.

Names carry the place in the run, capped at 60 characters:
`IconSplitter 2026-10-30 2/3 (100 icons)`, `… retry 1/1 (7 icons)`; a run that
fits in one batch keeps the plain `IconSplitter <date> (N icons)`. The confirm
dialog says how many batches the selection needs before anything is sent
(`stock-upload-getty-batches`), and the progress line names the batch it is on.

## 2. The re-upload list

An icon is worth exactly one of two things: uploaded, or the reason it needs a
re-upload. A card Getty answered with "Upload failed", an icon the page never
listed, or one with no thumbnail is **queued, not reported** — it gets one more
attempt (`GETTY_WEB_MAX_ATTEMPTS = 2`), never a third.

- Queued icons fill the **free room of a later primary batch** (`100 −` its
  icons), so a 250-icon run `[100, 100, 50]` can carry its rejections in batch 3.
- Whatever is left becomes the run's final `retry` batch(es).
- Only a **terminal** outcome is written to the row: an icon accepted on its
  retry is never first reported failed, and the run's summary says how many need
  re-uploading.

`auth`, `browser` and `helper-down` are session-level: another batch cannot fix
them, so they **stop** the run and every icon the run never reached is reported
failed with that reason. A cancel stops at the next batch boundary.

## 3. The loopback body: the config travels with the bytes

`POST /getty-web/upload` carries its config **in the body**, not in a header:
`[uint32 length][config JSON][staged bytes]`. The config of one request holds its
icons' title, description and up to 49 keywords — 25 icons is already ~130 KB,
and as a base64 header Node caps request headers at 16 KB: it answers 431 and
resets the socket, which a browser reports as a dropped connection ("the helper
dropped the upload"), not as anything a user can act on. In the body there is no
such limit, and no credential has to travel in a header at all.

The helper therefore reads the config from the body prefix and falls back to the
old `x-getty-web-config` header only for a request that has no prefix. A helper
older than this app build answers the prefix form with "this route drives the
Getty web upload only"; the app turns that into **restart run_ftp_bridge.bat**
rather than a mystery failure.

Two rules keep a failed request honest:

- A body over `BRIDGE_FTP_MAX_BYTES` is **drained** before the helper answers 413
  with the limit in the reason — answering mid-body and closing the socket is
  what looked like a helper that had vanished.
- An answer without JSON is reported with its **HTTP status**; only a request
  that never got an answer, while `/health` still answers, is called a dropped
  upload, and only one that cannot even be probed says "cannot reach the local
  helper".

## 4. What happens inside a batch

1. **Plan the parts.** A batch is too much for one loopback body: the helper
   buffers a whole request and refuses more than `BRIDGE_FTP_MAX_BYTES` (120 MB
   by default), while 100 pairs of real exports are easily hundreds of
   megabytes. `planGettyWebRequests` therefore splits the batch into requests of
   at most `GETTY_WEB_MAX_REQUEST_BYTES` (24 MB) and `GETTY_WEB_MAX_REQUEST_ICONS`
   (25) — by the plan's own byte estimates, so nothing is read to plan. An icon
   bigger than the budget still travels whole, alone.
2. **Attach and transfer, part by part.** The first part is sent with
   `newBatch: true` (the helper navigates to the contributor page and creates the
   batch, resetting the previous batch id, expected names and counts); every
   later part continues **that** batch. Only that part's bytes are read into
   memory, so a long run never holds a whole batch in the tab either.
   **If nothing new appears for 30 s** the helper reloads the batch page and
   re-attaches only the missing files (twice, then it fails honestly); a read
   that times out is that same stall, retried, not a socket error. It waits until
   the part's files are listed, then until each card proves its outcome:
   **Getty's `pending-icon` "Ready to submit"** is the final proof, a
   **thumbnail** the earlier one (a validated card counts before its picture
   renders), `invalid-file-media` ("Upload failed") is not — a listed row proves
   nothing. `GET /getty-web/progress` feeds the live counts (1 s poll).
3. **Metadata, per part.** Per contribution the helper selects the card by stem
   (clicking twice if Getty drops the first), waits for the drawer to unlock
   (disabled fields drop typed text), types title and description and writes
   **today's date** into Date Created as Getty renders it —
   `MM/DD/YYYY 00:00:00 +0000`. Prefilled prose is kept, the date always
   replaced, but **tags are never touched**. Every drawer saved, it selects all
   cards and presses **Save metadata** once. Then every card must show "Ready to
   submit": a `not-ready-icon` gets **Save metadata pressed again after 30 s**
   (twice at most), and one that stays unvalidated is named and the run does not
   claim success.
4. **Complete, then continue.** After the last part, `/getty-web/finish` closes
   that batch. A refusal names what is wrong and leaves the batch open; only a
   closed batch lets the next one be created, in the same signed-in session.
   Every card carrying "Ready to submit" with no Complete control on the page is
   the finished state too (`ready: true`).

A dropped part ends that batch: the icons behind it are queued for the retry
batch with their attempt unspent, and the batch still counts as completed if any
of its icons were accepted.

## 5. Helper side

- `POST /getty-web/upload` takes one part; `newBatch` chooses create-vs-continue,
  `complete` is always false (the run finishes each batch itself).
- A failed part never counts as accepted, and `ownFailures` hands a part only
  **its own** "Upload failed" cards — an earlier part's rejection must not stop
  this part from typing its metadata.
- A session with a request in flight is never swept by the 5-minute idle timer
  (`mayReleaseSession`): a 100-icon batch outlives it.
- `MAX_FILES_PER_ICON = 2`, `MAX_SESSIONS = 2`; staged files live in a temp
  folder deleted on close.

## 6. Tests

`getty_web_chunk` (the 100-upload cap, the request parts, batch names/labels) and
`stockupload_getty_web` (one batch per chunk, parts created once and continued,
a dropped part kept for the retry batch, retry folding, the two-attempt cap, a
sign-out stopping the run, cancel at a boundary). The helper's part rules are
pinned in `bridge_getty_web` (`ownFailures`, `mayReleaseSession`,
`failurePayload`, the 100-icon cap).
