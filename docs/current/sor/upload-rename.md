# Upload file naming (`workName` vs `uploadName`)

Parent: [SVG to upload](upload.md) · also governs [SVG builder](svg-builder-metadata.md) and [Stock upload](stock-upload.md).

## Contract (2026-11-19)

Every icon (`SVG to upload`), final artboard (`SVG builder`), and exported package (`Upload`) keeps its **real ID** (`pair.id` / `artboard.id`) and **working name** (`workName`) unchanged inside the app, while allowing a human-readable **upload file name** (`uploadName`) for the exported files sent to stock websites:

- **Formatting (`src/lib/upload/uploadname.ts`)**:
  - `buildUploadName({ title, description })` folds diacritics (NFKD), extracts ASCII alphanumeric words (`[A-Za-z0-9]+`) from `title` followed by `description`, preserves each word's capitalization, strips all commas `,`, periods `.`, spaces, and punctuation, and joins words with single underscores `_`.
  - **180-character whole-word cap (`UPLOAD_NAME_MAX_CHARS = 180`)**: words are added only while the joined length stays `<= 180`; any word that would cross 180 is omitted whole (never sliced mid-word, never leaving a trailing `_`).
  - `sanitizeUploadName(raw)` strips any accidental trailing file extension (`.svg`, `.jpg`, `.jpeg`, `.png`, `.eps`, `.zip`) and enforces the exact same underscore-word + `<= 180` whole-word rule.
  - `effectiveExportStem(workName, uploadName)` returns the sanitized `uploadName` when non-empty, else `workName`.
- **JSON-only storage — never in UI Metadata panels or embedded file metadata**:
  - `src/upload/uploadnamestore.ts` (`localStorage` `iconSplitter.upload.names.v1`, plus `FinalArtboard.uploadName` / `sheet.json` in SVG builder) stores pending or custom `uploadName` entries locally by item ID **before or after export**, so renaming before the first export causes the first export to write `<uploadName>.{svg,jpg,png,eps}` directly.
  - Every `export.json` stores `"workName"` and `"uploadName"` at top level (and `sheet.json` stores `"uploadName"` at top level). `uploadName` is **never** stored in `metadata.json` or `record.metadata`, **never** embedded inside `.svg` (`<title>`/`<desc>`/RDF), `.jpg` (XMP/IPTC), or `.eps` (`%%Title:` uses `${workName}.eps`; XMP carries only Title/Description/Tags), and **never** rendered inside the Metadata UI panels (`UploadMetaFields`, `StockUploadMetaFields`, `SvgBuilderRowMeta`, `SvgBuilderMetaFields`). Per-row manual editing lives in a dedicated **`✎ File name`** panel on each row.
- **Immediate atomic rename of existing `export/` packages (`src/upload/renameexport.ts`)**:
  - When an item is already exported in `export/`, renaming (bulk **✎ Rename for upload** from `Title + Description` or per-item manual apply/reset) stages via short `_rename_stage.<ext>` / `_rename_export.json` files, automatically steps down word-by-word (`fitStemToDir` + `shrinkUploadNameToBudget`) when OS path limits (e.g. Win32 `MAX_PATH` inside deep `_artboard_sheets/.../export/` folders) reject a long filename, renames companion `.png` outputs alongside `outputs.*`, commits updated `outputs.*.path` + `workName` + `uploadName` into `export.json`, and removes superseded old filenames last (RULE 23).
  - UI state (`uploadnamestore` / `FinalArtboard.uploadName`) updates **after** disk rename succeeds (persisting the exact OS-fitted stem) and reports real filesystem errors honestly — `"No selected ... have Title + Description metadata"` is shown only when zero selected items had metadata across memory, stage, `metadata.json`, and `export/export.json`.
  - When an exported package on disk already matches both `workName` and `uploadName`, `renameExportPackage` detects `alreadyNamed: true` (`diskRenamed: false`) without rewriting `export.json` redundantly.
- **Live progress bar + guaranteed single-item feedback ([RULE 27](../rules/PROGRESS.md#rule-27))**:
  - Bulk **`✎ Rename for upload`** across all 3 tabs (`src/upload/renameprogress.ts` + `src/ui/UploadRenameProgress.tsx`) mounts a live, cancellable `ProcessProgressBar` (`builder-rename-progress-*`, `upload-rename-progress-*`, `stock-rename-progress-*`), yields between items so massive batches update live (`done / total`, `remaining`, `%`, current item, `✕ Cancel`), and keeps the finished result summary open (`renamed`, `ready for first export`, `already had same name`, `skipped (no metadata)`, `failed`) until dismissed (`✕`) or replaced.
  - Single-item **`✓ Apply name`**, **`Enter`**, **`✦ From Title + Description`**, and **`↺ Reset to work name`** (`src/ui/UploadNameField.tsx` + `src/upload/renamefeedback.ts`) are never silently blocked on unchanged values: clicking them when the item already has that exact name (or already uses `workName`) always emits a fresh inline status message (`upload-name-status-<id>`, incrementing `data-seq` on every click) plus the tab toast (`"Upload file name is already … (no changes needed)"` / `"Already using work name … (no changes needed)"`).

## Selectors

- Bulk actions: `upload-rename-selected` (`SVG to upload`), `builder-artboards-rename` (`SVG builder` Final artboards), `stock-rename-selected` (`Upload`).
- Bulk `ProcessProgressBar` prefixes: `builder-rename-progress-*`, `upload-rename-progress-*`, `stock-rename-progress-*` (`header`, `title`, `file`, `completed`, `remaining`, `percent`, `cancel`, `review`, `dismiss`).
- Per-row `✎ File name` toggles & panels (separate from Metadata): `builder-artboard-rename-btn-<id>` / `builder-artboard-rename-panel-<id>`, `upload-rename-btn-<id>` / `upload-rename-panel-<id>`, `stock-rename-btn-<id>` / `stock-rename-panel-<id>`.
- Per-item editor (`src/ui/UploadNameField.tsx`): `upload-work-name-<id>`, `upload-file-name-<id>`, `upload-name-from-meta-<id>`, `upload-name-apply-<id>`, `upload-name-reset-<id>`, `upload-name-status-<id>`.
- Row indicators: `upload-export-name-<id>`, `builder-artboard-upload-name-<id>`, `stock-work-name-<id>`.
- Tests: `tests/upload_rename.test.ts`, `tests/upload_rename_ui.test.tsx`.
