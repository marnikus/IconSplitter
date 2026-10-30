# Getty web upload — metadata, dates and the repair walk

Parent: [Getty web upload](stock-upload-getty-web.md) · Handles:
[selectors/stock-upload](../selectors/stock-upload.md) · History:
[2026-10-30 design](../../archive/2026-10-30-getty-metadata-sweep/README.md).

## 1. What one drawer gets

Per contribution (a JPEG/EPS pair is one contribution, matched by stem) the run
selects the card by stem — twice if Getty drops the click — types title and
description and writes **today's date** into Date Created the way Getty renders
it (`MM/DD/YYYY 00:00:00 +0000`, `gettyCreatedDate`). Prefilled prose stays, the
date is always replaced, and **tags are never touched** (the keyword field only
gets Enter; an accepted date may still override the default). Each drawer is
saved as it is filled; the grid is then selected and saved once (`bulkSave`).

## 2. The drawer's own values are read back

`fillMetadataFields` returns `values` — what the drawer holds after typing. A
Date Created that did not take is reported as `date-missing` instead of `saved`,
so a file is never called finished while its timestamp is missing.

## 3. A drawer on its loading skeletons stops the walk

Getty paints the drawer as MUI skeletons before it has the contribution
(`[data-cy="metadata-skeleton"]`, `.MuiSkeleton-root`). `metadataEditorReady`
reports `{ ready, present, skeleton }`: a drawer with no usable field and a
skeleton is **not** waited out to the editor timeout.

`openDrawer` then returns `editor-skeleton`, and the walk:

- does **not** start the next file (the skipped one would stay without a date);
- reloads the batch page **at once** and starts again from the **first**
  pictured contribution;
- applies the date (and the accepted text where there is any) to **every**
  pictured file, saves each drawer, then the grid.

A file is skipped **only** when its card has no picture (no bytes arrived, so
there is no drawer) or when Getty rejected it. `withThumbnail`/
`withoutThumbnail` in `readUploadState` name both groups.

`sweepMetadata` restarts at most `METADATA_RESTARTS` (1) time per call — the
readiness ladder's reloads are the outer bound — and names whatever is still
unresolved; `report.sweeps` counts the walks that ran.

## 4. Readiness ladder

Every card must show `pending-icon` / `aria-label="Ready to submit"`, and the
bar's line climbs with them. A card still showing `not-ready-icon` follows a
30 s ladder: **Save metadata again**, then **reload and sweep again** (twice
each — the reload reopens and re-fills from file 0, never only re-saves), then
**re-upload the staged copy** (`reattachFiles`); every step re-reads the chips
and a batch always gets its own reload before it is given up on. The
`/getty-web/finish` request carries the batch's files, so its own reload repairs
too. An unvalidated file is named (`timeout`); verifying counts **chips**, so
100 % means submittable. `readiness`: `ok`, `notReady`, `resaves`, `repairs`.

## 5. Tests

`tests/getty_web_driver.test.ts` — the skeleton state, the pictured-card reading
and the read-back values. `tests/getty_web_finalize.test.ts` — a skeleton drawer
reloads before the next file is touched and both files are then filled from the
first, a date that did not take is repaired, and a card without a picture is the
only thing skipped. `tests/getty_web_session.test.ts` and
`tests/stockupload_getty_web.test.ts` keep the run, grouping and progress counts.
