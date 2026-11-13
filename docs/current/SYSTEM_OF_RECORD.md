# System of Record — task router

The current contracts now have one owner per tab or concern. Start with the
[current-doc routes](README.md); do not load every page. This path retains the
former numbered sections as navigational anchors for existing references.
Stable [invariant IDs](sor/invariants/README.md), [storage](sor/STORAGE.md),
[source owners](sor/OWNERS.md) and [tests](sor/TESTS.md) have direct lookup.

## 1. What this is

[Six-mode overview](sor/OVERVIEW.md).

## 2. Current behaviour (authoritative)

[Sheets](sor/sheets.md) · [Batch](sor/batch.md) · [Selection](sor/selection.md) ·
[Generate SVG](sor/svg-generation.md) · [AI-source image edits](sor/svg-image-edits.md) ·
[SVG to upload](sor/upload.md).

## 3. State model

[Sheets](sor/sheets.md#state) · [Batch](sor/batch.md#state) · [Selection V2](sor/selection.md#state) · [shared](sor/shared.md).

## 4. Core flows

[Sheets](sor/sheets.md#flow) · [Batch](sor/batch.md#flow) · [SVG generation](sor/svg-generation.md) · [upload](sor/upload.md).

## 5. Invariants

[ID-to-owner lookup](sor/invariants/README.md); [I-71](sor/invariants/svg-image-edits.md#i-71) and [I-72](sor/invariants/svg-image-edits.md#i-72) protect image edits.

## 6. Storage map

[Validated keys and files](sor/STORAGE.md).

## 7. Key modules and layers

[Owner map](sor/OWNERS.md).

## 8. Tests — what exists and what must exist (RULE 8)

[Focused test index](sor/TESTS.md).

## 9. Quality gates summary (RULE 16 — thresholds frozen)

[Code Verification](CODE_VERIFICATION.md) owns commands, thresholds and the ratchet.

## 10. History of designs — pointers

[Opt-in design pointers](sor/topics/DESIGN_POINTERS.md).

## 11. Current UI — control inventory

[Canonical selectors](UI_SELECTORS.md); [earlier inventory](sor/topics/UI_INVENTORY.md) is context, not the handle authority.

## 12. Session restore, reset to pending & the global undo timeline (2026-10-01)

[Session and undo](sor/topics/state-history.md).

## 13. The global activity log, and the shell that stopped the dock blocking rows (2026-10-05)

[Log and dock](sor/topics/log.md).

## 14. Folder copies and the remembered full path (2026-10-05)

[Path capture](sor/topics/paths.md); [current path invariants](sor/invariants/paths.md) take precedence.

## 15. One JSON per pair — the fix for "the folder shows only the AI approval" (2026-10-05)

[Pair file](sor/topics/pair-files.md).

## 16. One folder control, one path row (2026-10-05, I-44…I-46)

[Folder controls](sor/topics/path-controls.md).

## 17. Picking the batch's own output folder (2026-10-05, I-47/I-48)

[Output-root context](sor/topics/path-controls.md); I-48 is superseded by [I-56](sor/invariants/paths.md#i-56).

## 18. The same folders under any root (2026-10-05, I-49…I-51)

[Root-independent folders](sor/topics/path-controls.md).

## 19. When the browser will not hand over the folder's path (2026-10-05, I-52)

[Path recovery](sor/topics/path-recovery.md).

## 20. The API key that was saved and then gone (2026-10-07)

[Browser key storage](sor/topics/secret-store.md).

## Later dated context

[Batch](sor/topics/four-point-batch.md) · [export naming](sor/topics/export-naming.md) · [path identity](sor/topics/root-path-identity.md).
