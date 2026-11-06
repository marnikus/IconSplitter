# Batch flex layout — file info under thumbnail, no fixed widths

## Prompt (user request)
> put the file name and another information of file under thumbnail and remove column after the thumbnail to empty space for other columns. all columns has flex width to resize to width without fix width any more. will all space of row available.
> Understand problem give prompt first and then prepare doc first

## Understanding
Current Batch row grid (8 cols):
- 34px checkbox fixed
- 140px AI Image fixed
- minmax(180,280) File/path
- minmax(380,560) Detection (520px before)
- minmax(300,1fr) Preview
- 110px Created
- 90px Status
- 130px Open

Problems:
- File/path column wastes space, causes horizontal scroll, Detection column squeezed → controls wrap / appear frozen
- Fixed widths prevent using all row space, not responsive
- Thumbnail and file info separate → two columns for one concept

Goal:
- Combine thumbnail + file name + other info (relPath, size, etc) into ONE cell: thumbnail on top, info underneath
- Remove File/path column, freeing space for Detection and Preview
- All columns flex: no fixed px except checkbox (34px), others minmax with fr to fill available width
- Detection column min 300px+ (user asked) and wider to keep controls in one row flex-nowrap
- Preview column should take remaining space, flex

## Design

### New grid (7 cols after removal)
- col1 checkbox: 34px fixed (still needed for hit target)
- col2 thumb+info: minmax(160px, 1fr) — thumbnail + file name + path + size underneath, vertical stack
- col3 Detection: minmax(380px, 1.2fr) — at least 380px to fit all controls in one row, flex up to 1.2fr
- col4 Preview splits: minmax(320px, 2fr) — takes most space, 2fr, wraps thumbs
- col5 Created: minmax(90px, 0.6fr)
- col6 Status: minmax(80px, 0.5fr)
- col7 Open: minmax(110px, 0.7fr)

Total fr = 1 + 1.2 + 2 + 0.6 + 0.5 + 0.7 = 6fr, distributes available width after 34px.

Media query @1360px: same but with !important, keep flex.

### Components

#### ScanThumb + ScanFileCell merged
Create `BatchThumbInfoCell`:
- Uses `ScanThumb` (existing) for thumbnail
- Below it, shows file name (bold), relPath (small muted), size/mtime if available
- Vertical flex col, min-w-0, w-full
- Reuses `ScanFileCell` logic but rendered under thumb, not separate column

Alternatively, modify `ScanFileCell` to be used inside thumb cell, or create new `BatchFileUnderThumb`.

Keep `ScanThumb` as is, but wrap with info.

#### ScanTable.tsx
- Columns(): remove "File / path" header, keep 7 headers
- RowView: CheckCell, BatchThumbInfoCell, RowMergeCell, PreviewCell, DateCell, StatusCell, OpenCell
- RowMergeCell: already flex-nowrap, min-w 380px, stays
- PreviewCell: keeps flex-wrap for thumbs
- Update grid CSS in index.css for 7 cols

#### CSS
- .batch-columns, .batch-row: new template as above
- Remove .batch-row > :nth-child(4), :nth-child(5) stretch rules, replace with generic > * min-w-0 and stretch for Detection+Preview (now nth-child 3 and 4)
- Ensure .pair-table overflow auto still works, but with flex columns no horizontal scroll needed for typical widths

### RULE 18 / 16 compliance
- Functions ≤20 lines ideal, ≤30 hard fail
- File ≤300 lines (ScanTable currently 234, will stay ~220 after removal)
- CC ≤10, nesting ≤4
- BatchRowMergeBar already 36 lines, 6 fns, OK
- New BatchThumbInfoCell ≤30 lines, 1-2 fns
- Use memo for thumb info cell to keep 1000-row perf (no re-render storm)
- Tests first: update batch_row_merge tests to check new column count (7 not 8), thumb+info cell exists, Detection column min width, flex behavior

### TDD plan
- Update tests/batch_row_merge.test.tsx:
  - Check batch-columns has 7 children (not 8), includes Detection, Preview, but NOT File/path
  - Check each row has thumb+info cell with file name under thumbnail
  - Check Detection bar still exists with slider 0-0.15 step 0.0025, Apply/Reset, real-time value, flex-nowrap
  - Check that changing local detection does NOT clear previews, only override on next Preview click (already tested)
  - Check that plain row click only changes active, not checked (selection bug fix)
  - 1000-row perf still

- Run quality gate --changed --allow-legacy
- Run build

### Prompt for implementation (main)
> Refactor Batch list to combine thumbnail and file info into one cell under thumbnail, remove File/path column, make all columns flex (minmax with fr, only checkbox fixed 34px), Detection min 380px to keep controls in one row, Preview takes remaining space. Keep per-row merge override with real-time value and Apply/Reset, keep selection bug fix (plain click = active only), keep previews persisting on local change. Follow RULE 18/16.

## Implementation (done)

### New component
- `src/batch/BatchThumbInfoCell.tsx` — memo, 27 lines, 1 fn: renders ScanThumb + file name bold + relPath muted + ref missing note underneath, vertical flex, min-w-0 w-full, data-testid batch-thumbinfo-*

### ScanTable.tsx
- Removed ScanThumb + ScanFileCell imports, use BatchThumbInfoCell
- Columns: 7 headers (checkbox empty, AI Image / File, Detection, Preview splits, Created, Status, Open) — removed File/path
- RowView: CheckCell, BatchThumbInfoCell, RowMergeCell, PreviewCell, DateCell, StatusCell, OpenCell (7 cols)
- Keeps selectActive logic (plain click = active only), checkbox = select, Shift range, Ctrl toggle, range input ignored
- Footer hint unchanged

### CSS index.css
- .batch-columns, .batch-row: grid-template-columns: 34px minmax(160px,1fr) minmax(380px,1.2fr) minmax(320px,2fr) minmax(90px,0.6fr) minmax(80px,0.5fr) minmax(110px,0.7fr)
- Only checkbox fixed 34px, rest flex minmax fr (total 6fr)
- Detection min 380px one-row flex-nowrap kept
- Preview 2fr takes remaining space
- Media @1360px same with !important
- Updated nth-child stretch from 4,5 to 3,4 (Detection+Preview)

### Tests
- Created tests/batch_flex_thumb_info.test.tsx — 7 tests PASS:
  - combines thumbnail and file info into one cell under thumbnail
  - removes File/path column, header has 7 cols
  - all columns flex width (only checkbox fixed 34px), uses minmax fr, no 140px fixed
  - Detection bar stays one-row flex-nowrap min 360 and real-time
  - selection still: plain click active only, checkbox select, preserves checked
  - previews persist on local detection change (drag does not clear)
  - Apply sets override and immediately regenerates preview for this row
- Existing batch_row_merge 9 tests PASS (now includes Apply immediate preview, Reset immediate preview), batch_merge_preview 5 tests PASS (total 21 batch tests)
- quality:changed PASS (Batch files OK, 1 fn 27 lines for new cell, ScanTable 26 fns 232 lines, useBatchPreview 38 fns 187 lines)
- build PASS 1,517.66 kB gzip 447.03 kB

### RULE 18/16 compliance
- BatchThumbInfoCell: 1 fn, 27 lines, CC 1, nesting 1 — OK
- ScanTable: 26 fns, 232 lines (<300), CC low — OK
- BatchRowMergeBar: 8 fns, 42 lines — OK
- useBatchPreview: 38 fns, 187 lines (<300), added core preview with explicit override, previewSingle now accepts overrideFrac
- No fixed widths except checkbox 34px, all flex minmax fr
- Memo used for thumb info to keep 1000-row perf
- Selection bug fix preserved (plain click active only)
- Previews persist on local drag, Apply/Reset immediately regenerate that row only
- Detection real-time value preserved

## Update 2026-10-13 — Apply immediate preview (user request)
> apply - set override value to local + run and generated preview split for this row again immediate. Now it not run generate preview or run new regenerate preview. But i should

### Change
- `useBatchPreview.ts`: added `useDoPreviewCore` that takes explicit `eff` merge value, `usePreviewOne` now accepts optional `overrideFrac` to bypass rowMerges map and compute key with that eff, cache check with new key, `previewSingle` accepts optional override
- `BatchPanel.tsx`: `useRowMergeApply` now sets row merge AND calls `previewSingle(row, value)` to immediately regenerate preview for that row; new `useRowMergeReset` sets clear AND calls `previewSingle(row, global)` to regenerate with global merge; FullWidthList passes both
- Tests updated: batch_row_merge now expects Apply triggers immediate preview (checks preview count after Apply), Reset also triggers immediate preview, other previews not cleared

### Verification
- All batch tests PASS: flex 7, row_merge 9, merge_preview 5 = 21
- Drag alone does NOT clear previews, only Apply/Reset regenerates that row immediately
- quality:changed PASS, build PASS


