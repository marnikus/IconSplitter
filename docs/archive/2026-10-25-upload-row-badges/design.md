# Upload row badges — design (2026-10-25)

Named coloured labels on **SVG to upload** list rows. Independent of the
corner-badge decoration (`upload-badge.md`). Selection V2 / Generate SVG are
untouched.

## Problem

Upload rows have no user-defined tags. Reviewers cannot mark icons (priority,
stock site, redo) or filter the list by those marks. Multi-select already
exists (RULE 25); applying a label must use that selection.

## Contract

1. A **catalog** of badges `{ id, name, color }` is user-defined.
2. A row may hold **one or more** catalog ids.
3. **Settings…** opens a dialog: add (name + colour), rename, recolour, remove.
4. **Multi-apply:** checked rows toggle a catalog badge (all-on removes; else add).
5. **Filter:** All / No badges / Any badge / one named badge.
6. Persist in `localStorage iconSplitter.upload.rowBadges.v1` (RULE 13).
7. Catalog/assignment edits are one global `uploadRowBadges` undo entry (RULE 12).
8. Not the corner badge, not exported, not sent to a provider.

## Steps

1. Pure model `src/lib/upload/rowbadge.ts` + `tests/upload_rowbadge.test.ts`.
2. Store `src/upload/rowbadgestore.ts` + persist/corrupt tests.
3. Filter: `UploadListFilter.badge` + `rowlist.ts` + rowmodel tests.
4. Undo: extract `applyDomainEntry`, type `uploadRowBadges`.
5. Settings dialog, row chips, bulk apply, filter control.
6. Wire UploadPanel / Controls / BulkBar / Row (no file past 300 lines).
7. DOM tests `tests/upload_rowbadge_ui.test.tsx`.
8. Current docs + I-79; append QUALITY_RECHECK.

## Selectors (prefix `upload-rowbadge-`)

`upload-rowbadges-open`, `upload-rowbadge-dialog`, `upload-rowbadge-add`,
`upload-rowbadge-name-{id}`, `upload-rowbadge-color-{id}`,
`upload-rowbadge-remove-{id}`, `upload-rowbadge-chip-{rowId}-{badgeId}`,
`upload-rowbadge-toggle-{rowId}`, `upload-rowbadge-apply`,
`upload-rowbadge-apply-{id}`, `upload-filter-badge`.
