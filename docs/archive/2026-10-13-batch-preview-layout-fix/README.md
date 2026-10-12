# Batch Preview Layout Fix — Doc & Plan

## Problem (from screenshots 2026-10-13)

Current state (image-1.png):
- BATCH FOLDERS / IMAGES 53 rows
- Columns: AI IMAGE | FILE/PATH | (large empty gap) | PREVIEW SPLITS (narrow, far right) | CREATED | STATUS | OPEN
- Preview shows "4 icons" but only ~2 visible, rest off-screen with horizontal scrollbar
- Free space exists between File/Path and Preview, but Preview does not use it
- Expected: preview field should expand into remaining space between AI image and metadata, show full row of 4 (or up to 10) in one row, no scrollbar hiding icons. Use 2 rows if needed to display all icons fully, no horizontal scroll.

Second screenshot (image-2.png) expected:
- Same row, preview shows 4 flame icons fully in one row, no scrollbar, using space between file name and Created.

User analysis points to layout constraint, not icon size:
1. Column too narrow (max-width, fixed width, flex-basis, table-layout:fixed)
2. Carousel rule: overflow-x auto, flex-wrap nowrap, items 50% width, grid repeat(2,1fr), scroll-snap
3. Expansion blocked: width fit-content, overflow hidden, missing min-width:0
4. Generic strip reused with scroll

Requirement: allow Preview splits column to expand into available free space, make thumbnails container fill width (width:100%, min-width:0), lay out 4 thumbnails in single non-wrapping row (override 50%/repeat(2,1fr)+scroll), remove/relax overflow-x auto when all fit, no shrinking icons, no scrollbar hiding.

Additional: Use 2 rows for display all icons, no scroll bar hiding any icons. All icons visible as preview fully.

## Current Code Research

- `src/index.css` .batch-columns/.batch-row:
  - Initially 6 cols: 34px max-content minmax(280px,1fr) 122px 118px 160px
  - Fixed to 7 cols: 34px max-content minmax(180px,260px) minmax(320px,1fr) 110px 100px 140px
  - Media query @max-width 1360px previously overrode with 8-col svg layout, fixed with !important override
  - Still shows cramped preview -> 1fr not expanding as expected

- `src/batch/ScanTable.tsx`:
  - Columns header 7 spans
  - RowView class `svg-row batch-row` -> both classes apply, svg-row media query could still affect if not overridden with !important (we did)
  - PreviewCell: flex col, strip flex gap-1.5 overflow-x-auto, thumbs h-12 w-12, style flex:none
  - overflow-x-auto causes scrollbar when content overflows, but user wants no scrollbar, all visible, use 2 rows

- `src/batch/BatchPanel.tsx`:
  - Passes previews map to ScanTable, FullWidthList
  - No virtualization for main table (renders all 53 rows) -> okay for 53, but 1000 could be heavy; preview thumbs limited to 20 per row already

- `src/batch/useBatchPreview.ts`:
  - Renders thumbs as data URLs via renderIcon at THUMB_OUT 96, MAX_THUMBS 20, high-perf with cache LRU 200, concurrency 3

## Root Cause Deep Dive

1. **Grid 1fr not expanding due to parent overflow constraints**:
   - .pair-table has overflow-x auto and display grid with rows 30px auto, but no explicit width:100% for inner rows container? .svg-rows min-height 0 but no width.
   - .svg-panel .pair-table has overflow-x auto, overflow-y visible, which can cause 1fr to be computed based on content, not available space, especially when table-layout not fixed.
   - The large empty gap between File/Path and Preview is actually File/Path column's unused space? No, File/Path max 260px, so gap must be Preview column's empty space but with right-aligned content? PreviewCell has no justify, so should be left-aligned. Gap suggests Preview column is wide but its inner strip is narrow and right-aligned? Or Preview column is narrow and gap is from another column?

2. **PreviewCell uses overflow-x-auto + flex-none thumbs**:
   - overflow-x-auto + flex with flex:none prevents wrapping, forces scroll when content > container
   - User wants no scroll, all visible, use 2 rows -> should use flex-wrap, not overflow-x-auto
   - Need to remove overflow-x-auto, use flex-wrap, width:100%, min-width:0

3. **File/Path column still flexible in some breakpoints**:
   - Even with 260px max, on wide screen 1920px, 1fr should be large, but if parent .pair-table is not width:100%, 1fr computes to small.
   - Need to ensure .pair-table, .svg-rows, .batch-list, .batch-shell all width:100%, and batch-row width:100%

4. **Thumbnail size and count**:
   - Current h-12 w-12 (48px) for 10 icons = 534px, fits in 1fr (~1000px) without scroll
   - But if preview column is only 200px, 4 icons need 210px -> overflow -> scrollbar (as seen)
   - Fix: make preview column minmax(400px, 1fr) or larger, and make file/path smaller, or make preview column span more fr

## Plan

### Doc First (this file)

### Implementation Steps (RULE 18 ideal sizes, RULE 16 quality gates)

1. **CSS Grid Fix**:
   - Update `.batch-columns, .batch-row` to use more aggressive preview space:
     `34px 140px minmax(160px,220px) minmax(400px,1fr) 110px 90px 130px`
     - AI Image 140px (instead of max-content) to prevent large thumb taking space
     - File/Path 160-220px fixed max (was 260px) to free more for preview
     - Preview 400px min, 1fr max -> can display 10 icons (534px) easily, 2 rows if needed
   - Add `width:100%` and `min-width:0` to `.pair-table`, `.svg-rows`, `.batch-row`, `.batch-list`, `.batch-shell`
   - Ensure media query override for batch has same new columns with !important
   - Add `min-width:0` to all grid children to allow shrinking

2. **PreviewCell Redesign (no scrollbar, all visible, 2 rows)**:
   - Remove `overflow-x-auto`, replace with `flex-wrap` (or grid)
   - Container: `flex flex-wrap gap-1.5 w-full min-w-0`
   - Thumbs: `h-12 w-12` remains, but remove `flex:none`, allow wrapping
   - Count badge on top, then strip below that wraps to 2 rows if needed
   - No horizontal scrollbar, all icons visible fully
   - Keep data-testid `batch-preview-strip-*` and `batch-preview-count-*` for tests

3. **ScanTable RowView**:
   - Ensure PreviewCell gets `min-w-0` and `w-full`
   - Ensure row itself has `min-width:0` and `width:100%`

4. **High Perf**:
   - Keep MAX_THUMBS 20, but with wrapping 2 rows, 10 per row max, still okay
   - No additional DOM for 1000 rows beyond existing, but wrapping doesn't add overhead

5. **Tests Update**:
   - Update `batch_merge_preview.test.tsx` to check for flex-wrap, no scrollbar, count still present, strip inside same row, thumbs visible count <=20, no overflow-x-auto class
   - Keep TDD: preview button beside split, merge slider, count+strip per selected row inline, no file writes

6. **Verification**:
   - `npx tsc --noEmit` clean
   - `node tools/quality.mjs --changed --allow-legacy` GATE PASSED
   - `npm test -- batch_merge_preview` 5 green
   - Manual check: with 53 rows, preview column should take all space between file name and Created, display 4 icons in one row without scrollbar, 10 icons in 2 rows (5+5) without scrollbar

### RULE Compliance

- RULE 18 ideal sizes: functions <=20 lines, file <=300 lines, keep ScanTable 23 fns 217 lines -> will stay under 30 loc per fn
- RULE 16 quality: no new params >4, CC<=10, nesting<=4, LOC<=30 per fn
- Reuse detect/render pipeline, no FS writes during preview
- Single Sheets unchanged

### Files to Change

- `src/index.css`: grid columns, width 100%, min-width 0, media query override
- `src/batch/ScanTable.tsx`: PreviewCell flex-wrap, no overflow-x-auto, w-full
- `src/batch/BatchPanel.tsx`: no change needed (already passes previews)
- `tests/batch_merge_preview.test.tsx`: update expectations for wrap, no scrollbar

