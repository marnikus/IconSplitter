# Selectors — Stock Upload History

Behavior: [Stock Upload History](../sor/stock-upload-history.md) · Main Upload controls: [Stock Upload selectors](stock-upload.md).

## Upload history
- `stock-upload-history-open` — the **Upload history** button in the bulk bar (`stock-bulk-right`), right before `stock-remove-selected` and `stock-upload-start` (moved from the folder row 2026-11-08).
- `stock-upload-history-backdrop`, `stock-upload-history-dialog`, `stock-history-stock-select` — history modal and per-stock dropdown.
- `stock-upload-history-batch-<runId>-<stockId>` — one user-started run for that stock, newest first, with date/count, optional note in its second column (`stock-upload-history-note-<batchId>`), and outcome; clicking expands its details.
- `stock-history-file-<batchId>-<index>`, `stock-history-thumb-<batchId>-<index>`, `stock-history-hover-preview-<batchId>-<index>`, `stock-history-location-<batchId>-<index>` — compact uploaded-file row, clickable thumbnail with nearby hover preview, and copy-location action. `stock-history-preview`, `stock-history-preview-close` — enlarged preview dialog.
- `stock-rejected-open` — **Remove unsuccessful uploads** in the bulk bar, right before `stock-upload-history-open`.
- `stock-rejected-backdrop`, `stock-rejected-dialog`, `stock-rejected-stock` (stock dropdown), `stock-rejected-text` (pasted HTML or name list), `stock-rejected-summary` (live match count), `stock-rejected-unmatched` (names not found), `stock-rejected-cancel`, `stock-rejected-process`.
- `stock-history-select-files` — selects unique matching item rows present in the currently filtered Upload list (undo-aware); disabled when no batch items are visible.
