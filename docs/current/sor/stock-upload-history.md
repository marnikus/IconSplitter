# Stock Upload History — per-stock run records

Behavior: [Stock Upload](stock-upload.md) · UI handles: [selectors](../selectors/stock-upload-history.md) · Storage: [map](STORAGE.md#stock-upload).

## Behavior and storage

- The Upload toolbar's **Upload history** opens a local history dialog. Its stock dropdown separates records by preset ID (renaming a stock does not merge its history). Each user-started run creates one record per selected target; internal 100-icon / Getty chunks remain part of that run. The record shows the run date, successfully uploaded file count, failure count and cancellation state; its expanded file list contains successful files only.
- File rows are compact (30 px), show an on-demand thumbnail when possible, filename and **Location** copy action. Clicking a thumbnail opens a larger preview. Saved history contains no image bytes; previews load from the currently open workspace only when its exact captured root path matches the saved root and the source image still exists. Non-image files and unavailable sources show a fallback.
- `iconSplitter.stockUpload.batches.v1` is validated on read and bounded to 200 runs. It records stock/run identity, timestamp, counts, relative file paths, and full file paths only when the exact root path was captured for that folder handle. The browser cannot infer a drive path from a folder picker; if none was captured, Location copies the relative path and the app never guesses. Credentials and image bytes are not stored.
- **Select all files** selects the unique matching item rows that are in the current filtered Upload list. The list's selection granularity is item-level (not format-level), and the action uses its existing undo-aware selection history.
