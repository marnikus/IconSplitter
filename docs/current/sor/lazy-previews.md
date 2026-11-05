# Lazy row previews — every list tab (2026-11-06)

[Shared shell](shared.md) · [Activity bars](activity-bars.md)

A global top-bar checkbox **Lazy previews** (`lazy-previews-toggle`, stored
`iconSplitter.ui.lazyPreviews.v1`, on by default; only `off` reads as off).
While on, every row of every list is rendered (name, status, controls), but its
**preview** (image / SVG and the controls inside the preview column) waits:

- the first **20** rows (`EAGER_ROWS`) mount their preview at once;
- every later row shows an empty box of the same size (`.lazy-preview`) until
  it comes within **15** rows (`EDGE_ROWS`) of the visible area, then mounts
  its preview and **keeps** it — scrolling back never reloads or flickers;
- nothing inside a waiting preview runs, so no file is read or decoded for it.

Off, outside a list (dialogs), or in a browser without IntersectionObserver:
everything loads at once.

## Mechanism

- `src/ui/LazyPreview.tsx`: `LazyPreview` (wraps a row's preview; `size` = the
  zoom height, `width` for wide preview columns) and `withRowIndexes(rows)`
  (each list's final row array gets its positions through a context, keys kept,
  applied after any active-row `cloneElement`).
- **One IntersectionObserver per scroll area and look-ahead**, on the list's
  real scroll container (the nearest `overflow-y: auto|scroll` ancestor, e.g.
  `.app-main`) — watching the window would let that container clip the
  look-ahead away. Look-ahead = 15 × (row height + 24 px), in 250 px steps so
  rows of one list share an observer. An observer with nothing left to wait for
  disconnects.
- Wrapped previews: Batch `BatchThumbInfoCell`, Selection V2 `ReviewRow`,
  Generate SVG `SvgRow`, SVG to upload `UploadRow`, Upload `StockUploadRow`;
  numbered lists: `ScanTable`, `ReviewList`, `SvgList`, `UploadList`,
  `StockUploadList`.

## Tests

`lazy_previews.test.tsx`: default/stored switch, first 20 eager, same-size
waiting box, mount on near and keep, one shared observer on the list's scroll
area with a ≥ 15-row look-ahead, off loads everything, dialog/no-observer
fallback, wiring of every list and row and the top bar.
