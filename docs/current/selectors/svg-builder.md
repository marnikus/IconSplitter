# Selectors — SVG builder (`svgBuilder`)

`SvgBuilderPanel` mounts inside `builder-shell`. Start with the [behaviour contract](../sor/svg-builder.md) and the [shared tab table](shared.md). Prefer role / label / visible text over a testid.

## Shell, folder bar, header

| Testid | Element | Notes |
|---|---|---|
| `tab-svg-builder` | top-menu button | visible text `SVG builder` |
| `builder-shell` / `builder-panel` | wrapper / panel root | own `bld-*` classes only; `builder-unsupported` note without the folder picker |
| `builder-folder-widget` | folder bar | `builder-open-folder`, `builder-rescan`, `builder-scope-copy`, `builder-approved-count`, `builder-index-start` (◈ Icons indexing), `builder-index-count`, while running `builder-index-progress` + `builder-index-cancel`, `builder-audit`, `builder-folder-path` |
| `builder-meta-widget` | metadata prompt + Gemini widget (after the folder bar) | `data-open`; `builder-meta-toggle` (Minimize/Restore), `builder-meta-body` (drag-resizable), `builder-meta-restore-height`, `builder-metadata-state`, `builder-generate-metadata`, `builder-prompt-panel` (`builder-prompt`…, `builder-prompt-note`), `builder-provider-card` (`builder-provider-toggle`, `builder-limits`, `builder-model`, `builder-endpoint`, `builder-timeout`, `builder-retries`, `builder-concurrency`, `builder-model-check`, `builder-model-state`, `builder-key-state`…, `builder-provider-note`) |
| `builder-header` | header row | `builder-sheet-title` ("Untitled icon sheet" when empty) |
| `builder-undo` / `builder-redo` | global timeline | disabled when the stack is empty; title names the action |
| `builder-seed` | `↻ SEED ####` | re-roll (seed + 1) |
| `builder-brief` / `builder-corrected-brief` | open `builder-brief-dialog` | header / stage bottom-right |
| `builder-open-metadata` | Sheet metadata | unfolds `builder-meta-widget` |
| `builder-export-toggle` | `Export ▾` | menu `builder-export-menu`: `builder-export-svg`, `-png`, `-copy`, `-preset`, `-load` (`role=menuitem`); `builder-preset-file` hidden input |
| `builder-toast` / `builder-busy` / `builder-status-text` | toast zone | 4.2 s toast; errors stay |
| `history-bar` | global undo bar | shared with every tab |

## Icon library (left)

| Testid | Element | Notes |
|---|---|---|
| `builder-library` | column | `builder-library-count`; footer `builder-library-footer` |
| `builder-recipe` | Selection recipe card | `builder-recipe-mode` (segmented; `-similar`, `-random`, `-filtered`) |
| `builder-reference` / `builder-threshold` / `builder-similar-unindexed` | Similar pane | reference line; Similarity slider `≥ N%` 0–100 (`builder-threshold-value`); `builder-weight` Look alike ◀▶ Mean alike: `builder-text-weight` slider + split bar, `builder-weight-image`, `builder-weight-text`; not-indexed warning |
| `builder-recipe-category-{c}` | Filtered pane chips | shared category with the library chips |
| `builder-random-note` | Random pane | "A seeded draw from all N glyphs…" |
| `builder-reshuffle-recipe` / `builder-recipe-caption` | `Reshuffle N icons` + caption | |
| `builder-search` / `builder-search-clear` | "Search name or #tag" | leading `#` stripped |
| `builder-category-{c}` | category chips | All + categories |
| `builder-icon-grid` / `builder-asset-{id}` | 6-column tiles | `data-asset-id`, `data-selected`, `aria-pressed`; `builder-match-{id}` Similar dot; `builder-unindexed-{id}` ⚠ + `data-unindexed`; `data-nometa` dashed amber tile; `builder-prev-{id}` stroke-only preview |
| `builder-library-empty` / `builder-library-nomatch` / `builder-library-more` | empty states | |
| `builder-cells` / `builder-locked-count` / `builder-clear` | footer | "N of C cells", "N locked", CLEAR |

## Stage (centre)

| Testid | Element | Notes |
|---|---|---|
| `builder-stage` / `builder-canvas` | column / scroll area | `builder-stage-empty` before a composition |
| `builder-layout-{editorial,masthead,plain}` | Side banner / Top split / Plain grid | `aria-pressed`; `builder-custom-pill` after an edit |
| `builder-zoom-out` / `builder-zoom` / `builder-zoom-in` / `builder-fit` / `builder-zoom-1` | zoom | `builder-zoom` text = %, click → fit |
| `builder-artboard` | scaled artboard | `data-zoom`; composed SVG in a shadow root |
| `builder-empty-cell-{i}` | dashed `+` placeholder | `data-placeholder`, preview only |
| `builder-cell-lock-{i}` | per-cell lock | `aria-pressed`; visible on hover / when locked |
| `builder-cell-exclude-{i}` / `builder-cell-score-{i}` | per-cell × exclude + refill (Shift+click: remove, leave empty) / % closeness | score `data-tone` ref/high/low/none; `builder-toggle-scores` toolbar toggle + `builder-score-opacity` 1–100 % slider (`builder-score-opacity-value`); footer `builder-excluded-count` + `builder-excluded-restore`; tile `data-excluded` |
| `builder-reshuffle-stage` | floating Reshuffle | top-right |
| `builder-stage-status` | status line | overflow / empty cells / "N glyphs placed…" + "LIVE VECTOR PREVIEW · W × H px" |

## Customize (right)

| Testid | Element | Notes |
|---|---|---|
| `builder-inspector` | column | `builder-reset` (RESET) |
| `builder-section-{artboard,grid,icons,banner}` | collapsible sections | badge `W×H`, `C × R`, `fit to box`, position/`hidden`; Artboard starts collapsed |
| `builder-width` / `builder-height` / `builder-padding` / `builder-radius` | px number boxes | commit on Enter/blur, clamp |
| `builder-canvas`… swatches: `builder-canvas-picker`, `builder-canvas-{hex}` | Canvas colour | 8 swatches |
| `builder-columns` / `builder-rows` | steppers | `-dec`, `-inc`, `-value` |
| `builder-gap-x` / `builder-gap-y` / `builder-caption-size` | sliders | `{id}-value` pill |
| `builder-captions` | switch | `role=switch`; `builder-caption-controls`, `builder-caption-ink`, `builder-caption-case` |
| `builder-icon-box` / `builder-stroke-width` / `builder-stroke-color` / `builder-linecap` | Icon style | |
| `builder-banner-position` / `builder-banner-style` / `builder-banner-size` | Banner | `builder-banner-hidden` when None |
| `builder-banner-bg` / `builder-accent` / `builder-title-ink` / `builder-subtitle-ink` | colour chips | |
| `builder-title` / `builder-subtitle` / `builder-title-size` / `builder-subtitle-size` / `builder-title-face` | banner copy | |
| `builder-hero` / `builder-hero-icon` / `builder-divider` | Hero glyph, Glyph select, Accent rule | |

## Dialogs

| Testid | Element | Notes |
|---|---|---|
| `builder-brief-dialog` | brief | `builder-brief-tab-brief`, `-tab-raw`, `builder-brief-copy`, `builder-brief-close`, `builder-brief-text`, `builder-brief-raw`, `builder-brief-count` |
| `builder-meta-dialog` | exact request | `builder-meta-preview` (768 px JPEG), `builder-meta-prompt`, `builder-exact-request`, `builder-meta-confirm`, `-accept`, `-cancel`, `-close`, `builder-meta-draft` |
