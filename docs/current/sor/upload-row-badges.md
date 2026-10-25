# Upload row badges — named labels on list rows

Part of [SVG to upload](upload.md). Independent of the [corner badge](upload-badge.md)
decoration. Selectors: [upload-row-badges](../selectors/upload-row-badges.md).
Design: `docs/archive/2026-10-25-upload-row-badges/design.md`. [I-79](invariants/upload.md#i-79).

## What they are

User-defined `{ id, name, color }` labels. A row may hold one or more catalog
ids. They never enter the export package, metadata request, or corner artwork.

**Badges…** (`upload-rowbadges-open`) opens a dialog: add a name + colour,
rename, recolour, remove. Removing a badge unassigns it from every row.

**Per row:** coloured chips under the file name; **+ Badge** toggles catalog
entries on that icon.

**Multi-apply:** **Apply badges** on the bulk bar toggles one catalog badge on
every checked id. If all already have it, the click removes it; otherwise it
adds it to those missing it (hidden checks included, same as other upload bulk
decorations).

**Filter:** All / No badges / Any badge / one named badge (`upload-filter-badge`).

## Persistence and undo

`localStorage iconSplitter.upload.rowBadges.v1` `{ v: 1, catalog, assigned }`.
Junk entries drop themselves (RULE 13). Catalog/assignment edits are one global
`uploadRowBadges` history entry.

Owners: `src/lib/upload/rowbadge.ts`, `src/upload/rowbadgestore.ts`,
`rowbadgeactions.ts`, `rowbadgeundo.ts`, `UploadRowBadge*.tsx`.
Tests: `upload_rowbadge`, `upload_rowbadge_store`, `upload_rowbadge_ui`.
