# Selectors — SVG builder (`svgBuilder`)

The seventh tab mounts `SvgBuilderPanel` inside `builder-shell`. Start with the [behaviour contract](../sor/svg-builder.md) and the [shared tab table](shared.md). Prefer role / label / visible text over a testid.

## Workbench and shell

| Testid | Element | Notes |
|---|---|---|
| `tab-svg-builder` | top-menu button | visible text is exactly `SVG builder`; drives `AppState.tab = svgBuilder` |
| `builder-shell` | hidden workspace wrapper | Workbench keeps it mounted after the first visit |
| `builder-panel` | panel root | dark chrome; `builder-unsupported` is shown when the File System Access picker is absent |
| `builder-controls` | header stack | full-width folder widget + prompt/provider grid |
| `builder-statusbar` | status line | `builder-status-text`, `builder-status-count`, `builder-busy`, `builder-warning`, `builder-toast` |
| `history-bar` | global undo bar | shared with every tab; builder gestures use `builderChecked` / `builderConfig` |

## Folder widget and library

| Testid | Element | Notes |
|---|---|---|
| `builder-folder-widget` | full-width folder card | approved-only, recursive, read-only scan |
| `builder-open-folder` | green `Open folder` button | one picker; the `＋` prefix is decorative |
| `builder-rescan` | rescan button | explicit all-folder approved discovery |
| `builder-folder-path` | full-width read-only path row | `FolderPathRow`; absent until a root is open |
| `builder-scope-copy` | scope note | states that only approved SVGs are read |
| `builder-approved-count` | count | approved asset total |
| `builder-audit` | audit line | honest excluded/corrupt/unreadable counts |
| `builder-library` | approved library | `builder-library-count`, `builder-library-empty`, `builder-library-more` |
| `builder-search` / `builder-category` | filters | library view only; never change the approved set |
| `builder-recipe-mode` / `builder-recipe-profile` / `builder-threshold` / `builder-seed` | recipe controls | deterministic selection |
| `builder-fill-library` | explicit fill checkbox | no silent fallback from the full library |
| `builder-apply-recipe` / `builder-shuffle` / `builder-clear` | selection actions | one global selection history entry |
| `builder-asset-{id}` | asset card | `data-asset-id`, `data-selected`, `data-locked`, `aria-pressed` |
| `builder-prev-{id}` | shadow-root preview | sanitized approved SVG only |
| `builder-lock-{id}` | lock control | one global config history entry |

## Stage, inspector and metadata

| Testid | Element | Notes |
|---|---|---|
| `builder-stage` | artboard stage | `builder-stage-empty` until the composition is ready |
| `builder-artboard` | shadow-root SVG host | light paper artboard inside dark chrome |
| `builder-layout-{id}` | layout preset button | `classic`, `dark`, `contact` |
| `builder-zoom-out` / `builder-zoom` / `builder-zoom-in` / `builder-fit` | zoom controls | display-only preference |
| `builder-export` | export menu | `builder-export-svg`, `builder-export-png`, `builder-export-copy`, `builder-export-preset`, `builder-export-load` |
| `builder-document-facts` | composition facts | config fingerprint, placed/broken counts, accepted metadata state |
| `builder-inspector` | layout inspector | grouped artboard/grid/icon/banner fields; `builder-inspector-toggle` |
| `builder-prompt-panel` | metadata prompt card | shared `PromptWindow` with `builder-prompt`, `builder-prompt-window`, `builder-prompt-reset` |
| `builder-generate-metadata` | generate button | opens the exact-request dialog; no provider call on render |
| `builder-brief` | brief button | opens `builder-brief-dialog` |
| `builder-provider-card` | shared Gemini card | `builder-provider-toggle`, `builder-provider-grid` |
| `builder-model` / `builder-endpoint` / `builder-timeout` / `builder-retries` / `builder-concurrency` | provider fields | shared `GeminiConfig` |
| `builder-model-check` / `builder-model-state` / `builder-provider-note` | model check | explicit GET; configured model never substituted |
| `builder-key-state` | shared key slot | IndexedDB key vault; `builder-key-input`, `builder-key-save`, `builder-key-cancel`, `builder-key-forget` |
| `builder-meta-dialog` | exact-request modal | `builder-meta-preview`, `builder-meta-prompt`, `builder-exact-request`, `builder-meta-key`, `builder-meta-model`, `builder-meta-status` |
| `builder-meta-confirm` / `builder-meta-cancel` / `builder-meta-accept` / `builder-meta-close` | modal actions | one confirmed request, no auto-retry; accept before export |
| `builder-meta-draft` | provider draft | `builder-meta-title`, `builder-meta-subtitle`, `builder-meta-keywords` |
