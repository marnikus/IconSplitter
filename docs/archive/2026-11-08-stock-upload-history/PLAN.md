# Stock Upload History — implementation design

## Goal

Add a persistent, per-stock history of user-started Stock Upload runs. Each record keeps successful file entries (including source-relative path and an exact full path only when the picked root has an exact captured path), the run date, and success/failure counts. Preserve the existing latest per-item/per-stock status history unchanged.

## Decisions

- A user-started run creates one history batch for each selected stock target, independent of the runner's internal 100-icon chunks. Partial, cancelled, and zero-success attempts remain visible with their counts; only successful files appear in the batch's file list.
- History stays local in the app's validated local-storage abstraction; it stores names, paths, IDs, counts and timestamps, never credentials or image bytes. Keep the store bounded.
- File locations are copied to clipboard, not opened in Explorer. Full paths are recorded only from the path already bound to that exact root handle; otherwise the UI offers the relative path and explicitly does not guess.
- Previews are loaded on demand from the matching currently open root and only for image formats. They are not persisted. If the source is absent, the preview is unavailable.
- “Select all files” selects the corresponding unique item rows that are both represented in the batch and currently visible after Upload-tab filters. The Upload list selection model is item-level, not per-format.

## Work sequence

1. Test and implement pure batch-history parsing, append/limit and path validation.
2. Extend the transfer runner with per-task outcome reporting; append one batch per planned target after a run, including partial/cancelled outcomes.
3. Add history button, stock/batch navigation, compact file rows, copy-location action and lazy image preview dialog.
4. Connect batch selection to Upload's existing undo-aware selection actions, scoped to currently visible matching rows.
5. Add focused runner/store/UI tests, update current behavior and selector docs, and run TypeScript, lint, quality and verification gates.
