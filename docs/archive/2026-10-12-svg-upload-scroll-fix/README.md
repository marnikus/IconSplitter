# SVG to upload / Generate SVG blank areas and clipped list — root cause and fix

Date: 2026-10-12
Tab integration: Generate SVG stays mounted (hidden={tab!=="generateSvg"}), Upload reuses .svg styles. Shared app shell must stay unchanged.

## Symptom (image-1.png)
- Filters row (PACKAGE, METADATA, SORT BY, SEARCH) at top
- Yellow banner "310 pair(s) not listed"
- Bulk bar "0 selected"
- APPROVED SVGS / EXPORT PACKAGES list appears clipped to small height, with its own inner scrollbar
- User wants page full scroll down, not list scrolling only in small high win

## Root causes (from src/index.css)

1. **.folder-path blank area**
   - .folder-path was `flex: 1 0 100%` inside .svg-controls which is `display:flex flex-direction:column`
   - In column flex, flex-basis 100% means 100% tall, so folder path row grew to 100% height, pushing blank area between controls and banners
   - Fix: `flex:0 0 auto width:100%` — full width, auto height, does not grow in column context. In other tabs parent is block, width:100% still gives full-width wrap.

2. **Shells height:100% prevented growth**
   - .v2-shell, .svg-shell, .up-shell had `height:100%` (fixed to app-main viewport)
   - .v2, .svg had min-height:100% inside, but if content taller than viewport, shell fixed height clipped and app-main did not scroll because its direct child was viewport height
   - I-27 requires panels floored at band (min-height:100%) and grow with content, app-main scrolls
   - Fix: shells `min-height:100%` not `height:100%`, so they are floored at viewport and grow when inner .v2/.svg grows (137 rows)

3. **Small high win inner scroll**
   - Previous attempt added flex:1 to .v2-panel/.svg-panel and display:flex to shells and .v2/.svg and app-main
   - That made .svg-panel fill remaining space after controls/banners/bulk, so pair-table overflow:auto scrolled inside limited height → clipped APPROVED list
   - User wants whole page scroll, not inner scroll
   - Fix: revert app-main to `flex:1 min-height:0 overflow:auto` (no display:flex), shells to `width:100% min-height:100%` (no flex, no display:flex), .v2/.svg to `width:100% display:flex flex-direction:column gap:10px min-height:100%` (no flex:1)
   - .svg-panel specifically: `grid-template-rows:42px auto 40px` not `42px 1fr 40px`, `overflow:visible` not `hidden`, so middle row auto height grows with content
   - .svg-panel .pair-table: `grid-template-rows:30px auto` and `overflow-x:auto overflow-y:visible` — vertical growth is whole page, horizontal auto preserves 800px zoom per I-55

## What was left unchanged (per task)
- .app-shell 100dvh flex column, nav, dock
- V2 panel keeps original `42px minmax(0,1fr) 40px overflow:hidden` with inner scroll — other tabs unchanged
- Batch, Selection wrappers w-full already

## CSS diff summary
- .app-main: removed display:flex flex-direction:column min-width:0, kept flex:1 min-height:0 overflow:auto
- .v2-shell/.svg-shell/.up-shell: removed flex:1 display:flex flex-direction:column min-height:0 min-width:0, kept width:100% min-height:100% background
- .v2/.svg: removed flex:1 min-width:0, kept width:100% display:flex flex-direction:column gap:10px min-height:100%
- .v2-panel: reverted to display:grid 42px 1fr 40px min-height:0 overflow:hidden (no flex)
- .svg-panel: display:grid 42px auto 40px min-height:0 overflow:visible + added .svg-panel .pair-table override
- .folder-path: flex:0 0 auto width:100%

## Tests updated
- tests/log_layout.test.tsx: shells now expect min-height:100% not height:100%
- tests/layout_fullwidth.test.tsx: shells expect width:100% min-height:100%, v2/svg expect width:100% display:flex column min-height:100% (no flex), app-main expects flex:1 overflow:auto, svg-panel expects auto rows overflow:visible and pair-table overflow-x:auto overflow-y:visible

## Verification
- npm test layout_fullwidth + log_layout passes (17 tests)
- svg_ui + selectionv2_ui passes (72 tests)
- Manual: Generate SVG and Upload now show filters, banners, bulk bar, full APPROVED list with page scroll via app-main, not inner small win. 800px zoom still honoured via overflow-x:auto

## RULE 16 / 18 check
- No new JS functions, only CSS — CC, nesting, size unchanged, tsc clean, lint clean
- Ideal sizes not affected
