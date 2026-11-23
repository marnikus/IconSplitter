# Upload file naming (`workName` vs `uploadName`)

Parent: [SVG to upload](upload.md) · also governs [SVG builder](svg-builder-metadata.md) and [Stock upload](stock-upload.md).

## Contract (2026-11-19)

Every icon (`SVG to upload`), final artboard (`SVG builder`), and exported package (`Upload`) keeps its **real ID** (`pair.id` / `artboard.id`) and **working name** (`workName`) unchanged inside the app, while allowing a human-readable **upload file name** (`uploadName`) for the exported files sent to stock websites:

- **Formatting (`src/lib/upload/uploadname.ts`)**:
  - `buildUploadName({ title, description })` folds diacritics (NFKD), extracts ASCII alphanumeric words (`[A-Za-z0-9]+`) from `title` followed by `description`, preserves each word's capitalization, strips all commas `,`, periods `.`, spaces, and punctuation, and joins words with single underscores `_`.
  - **180-character whole-word cap (`UPLOAD_NAME_MAX_CHARS = 180`)**: words are added only while the joined length stays `<= 180`; any word that would cross 180 is omitted whole (never sliced mid-word, never leaving a trailing `_`).
  - `sanitizeUploadName(raw)` strips any accidental trailing file extension (`.svg`, `.jpg`, `.jpeg`, `.png`, `.eps`, `.zip`) and enforces the exact same underscore-word + `<= 180` whole-word rule.
  - `effectiveExportStem(workName, uploadName)` returns the sanitized `uploadName` when non-empty, else `workName`.
- **Local pre-export & `export.json` persistence**:
  - `src/upload/uploadnamestore.ts` (`localStorage` `iconSplitter.upload.names.v1`, plus `FinalArtboard.uploadName` / `sheet.json` in SVG builder) stores pending or custom `uploadName` entries locally by item ID **before or after export**, so renaming before the first export causes the first export to write `<uploadName>.{svg,jpg,png,eps}` directly.
  - Every `export.json` stores both `"workName"` (the unchanged app working stem, e.g. `icon-sheet_sheet_10_icons_yellow_blue_palette_id39045_v1` or `fog_03`) and `"uploadName"` (the exported upload stem).
- **Immediate atomic rename of existing `export/` packages (`src/upload/renameexport.ts`)**:
  - When an item is already exported in `export/`, renaming (bulk **✎ Rename for upload** from `Title + Description` or per-item manual apply/reset) atomically writes and verifies the renamed `.svg`/`.jpg`/`.png`/`.eps`/`.zip` files first, commits updated `outputs.*.path` + `workName` + `uploadName` into `export.json`, and removes the superseded old filenames last (RULE 23).

## Selectors

- Bulk actions: `upload-rename-selected` (`SVG to upload`), `builder-artboards-rename` (`SVG builder` Final artboards), `stock-rename-selected` (`Upload`).
- Per-item editor (`src/ui/UploadNameField.tsx`): `upload-work-name-<id>`, `upload-file-name-<id>`, `upload-name-from-meta-<id>`, `upload-name-apply-<id>`, `upload-name-reset-<id>`.
- Row indicators: `upload-export-name-<id>`, `builder-artboard-upload-name-<id>`, `stock-work-name-<id>`.
- Tests: `tests/upload_rename.test.ts`, `tests/upload_rename_ui.test.tsx`.
