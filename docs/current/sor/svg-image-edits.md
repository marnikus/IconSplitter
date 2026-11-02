# AI-source image edits — current behaviour

Read [I-71](invariants/svg-image-edits.md#i-71) and [I-72](invariants/svg-image-edits.md#i-72) for non-overwriting pair history and composite identity; see [image-edit handles](../selectors/svg-image-edits.md), [storage keys](STORAGE.md) and [tests](TESTS.md). This workflow is independent of SVG-text contact-sheet generation.

See [parallel-run safety and completion sound](svg-parallel-runs.md): independent SVG work may continue, but shared-pair edits refuse before send and image leases survive review.

See [automatic Apply and batch progress](svg-image-auto-apply.md) for the persisted
opt-in checkbox, frozen run policy, independent image process bar and Stop.

Image chips [accept the selected version as the actual source](version-acceptance.md),
without approving an existing SVG.

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
  become genuine per-icon PNG crops. By default multi-icon responses wait for
  **Apply/Discard** review because a model can rearrange artwork
  while preserving its aspect ratio. Apply rechecks each original pair and
  source bytes, appends independent non-overwriting image versions, and moves
  each saved pair's main pointer; Discard changes no pair history. A failed
  or changed cell never re-points another pair. With explicit automatic Apply
  enabled at confirmation, the same guarded save runs without a result popup.
  Stop prevents unsent groups; sent responses follow the frozen Apply policy. Request-level tokens, cost and ID are
  logged **once per composite** (never invented or multiplied by icon count),
  and a validated metadata-only journal leaves unknown or lost-on-reload
  requests for deliberate reconfirmation, never auto-retry.

## AI sources already in the folder are registered

The row shows the AI image the pair was approved with plus its own
regenerations. An image that was already there — the original before a split, a
`_vN` written by an older build, a copy, a hand edit — stayed invisible, so the
row kept showing the wrong artwork. **⤓ Register AI sources (N)**
(`svg-register-images`, 2026-11-02) reads every selected folder once:

- PNGs in the pair's folder and in its `AI source regeneration versions` folder
  are matched by name (`src/lib/foldernames.ts`, shared with the SVG pass), so
  `download-icon-01_AI.png` inside `download-icon-01_AI/split_01/` is this pair's.
  The pair's own AI image and its reference image are never re-registered: a
  folder with only those changes nothing and the toast says which original it saw.
- A name that carries `_vN` keeps that number; an unnumbered file takes the next
  free one, so nothing on disk is invisible and nothing is counted twice. A file
  the pair file already records is skipped; a name two pairs both answer to is
  refused and reported, never guessed.
- A file is recorded only after its bytes prove a PNG (signature read through the
  normal file path); anything else is counted, said out loud and not recorded.
- The newest **NUMBERED** version becomes `imagePreferred` — the main image the
  row shows and SVG generation vectorizes (`mainImageOf`). An unnumbered copy is
  taken in but never moves the pointer on its own.
- One `saveMetaAt` per pair through the usual verified path; the SVG fields and
  the pair's review status are untouched; a busy pair is refused; nothing on disk
  is renamed or deleted.
- A registered image becomes that pair's history, never artwork of its own:
  Selection V2 drops any pair whose side is a recorded `imageVersions` path of a
  different pair (`withoutRecordedVariants`, `src/lib/imageartifact.ts`), so
  registering sources never adds review rows to the other tab. Generate SVG
  needed no change — it lists only approved canonical sources.

Regressions: `svg_register_images` (names, numbering, the original, ties, the
summary line) and `svg_register_images_ui` (the pair's own image, a numbered
regeneration, a copy, a non-PNG, a second click, a busy pair, the split folder
from the report through a real click).
