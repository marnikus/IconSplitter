# AI-source image edits — current behaviour

Read [I-71](invariants/svg-image-edits.md#i-71) and [I-72](invariants/svg-image-edits.md#i-72) for non-overwriting pair history and composite identity; see [image-edit handles](../selectors/svg-image-edits.md), [storage keys](STORAGE.md) and [tests](TESTS.md). This workflow is independent of SVG-text contact-sheet generation.

See [parallel-run safety and completion sound](svg-parallel-runs.md): independent SVG work may continue, but shared-pair edits refuse before send and image leases survive review.

## Confirmed composite workflow

* **AI-source image edits (2026-10-19, I-71/I-72):** the separate
  **Icons per image-edit request** preference (default 4, integer 1–16,
  further limited by the configured square output size at ≥256 px/cell) does
  not alter SVG text batching or the image connection's output `n`. Size 1
  keeps one source/edit request and immediate-save behaviour. For multiple
  selected icons at size >1, the dialog locally reads each current main
  image, builds ONE square PNG reference per request in selected-ID order,
  displays that exact Blob, a 1-based row-major filename manifest (relative
  paths only where names collide), empty cells, provider/model and the complete
  thin-line/grid-preservation prompt.
  Regenerated PNGs remain addressable through `imageVersions` / `mainImageOf`,
  but recursive Selection and Generate SVG discovery do not treat those exact
  app-owned files as fresh review pairs or audit references; unrelated files in
  the version folder are still scanned (I-71).
  A failed preflight group is named and not sent; other prepared groups remain
  available. A changed source between preview and send is refused, never
  silently replaced. Each confirmed request sends one multipart `image[]`
  composite to `/images/edits` and requires exactly one returned image.
  Percent-based saved cell rectangles are scaled to the returned square's
  actual dimensions (not the sent dimensions); supported decoded formats
  become genuine per-icon PNG crops. Multi-icon responses wait for an explicit
  **Apply/Discard** side-by-side review because a model can rearrange artwork
  while preserving its aspect ratio. Apply rechecks each original pair and
  source bytes, appends independent non-overwriting image versions, and moves
  each saved pair's main pointer; Discard changes no pair history. A failed
  or changed cell never re-points another pair. Stop prevents unsent groups;
  sent responses may still need review. Request-level tokens, cost and ID are
  logged **once per composite** (never invented or multiplied by icon count),
  and a validated metadata-only journal leaves unknown or lost-on-reload
  requests for deliberate reconfirmation, never auto-retry.
