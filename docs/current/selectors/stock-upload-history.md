# Selectors — Stock Upload History

Behavior: [Stock Upload History](../sor/stock-upload-history.md) · Main Upload controls: [Stock Upload selectors](stock-upload.md).

## Upload history
- `stock-upload-history-backdrop`, `stock-upload-history-dialog`, `stock-history-stock-select` — history modal and per-stock dropdown.
- `stock-upload-history-batch-<runId>-<stockId>` — one user-started run for that stock, newest first, with date and uploaded/failed counts; clicking expands its details.
- `stock-history-file-<batchId>-<index>`, `stock-history-thumb-<batchId>-<index>`, `stock-history-location-<batchId>-<index>` — compact uploaded-file row, clickable image preview, and copy-location action. `stock-history-preview`, `stock-history-preview-close` — enlarged preview dialog.
- `stock-history-select-files` — selects unique matching item rows present in the currently filtered Upload list (undo-aware); disabled when no batch items are visible.
