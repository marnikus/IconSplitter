# Generate SVG and image-edit tests

Focused test inventory; [all tests](../TESTS.md).

* `prompt_presets_shared.test.ts` — the one preset rule (pick, Quick load refusal, Save as snapshot and blank refusal, Delete keeps the editor) and the store round-trip per key (2026-10-09, I-65); `svg_prompt_presets.test.ts` — the same rule through the real Generate SVG reducer, the SVG list separate from the metadata list; `svg_regen_ui.test.tsx` — the regen window over its real storage (main by default, drop-down of SVG presets, live list update, no row in Export settings, regen above the prompt window).
* `svg_regen.test.ts`, `svg_regenprompt.test.ts`, and the Regenerate-from-SVG block of `svg_runner.test.ts` (2026-10-09) — the stored choice and its refusals, the main prompt + first image (locked), the saved prompt + newest valid code + same image (one icon per request, the record without the code), the row and its global-only scope
* `svg_lib.test.ts` — also `clampTimeoutMs` / `clampRetries` (the card's own
  controls share the read path's clamps) including nonsense input.
* `svg_batch.test.ts`, `svg_effort.test.ts` — the split and the tier rules:
  1/3/4/5/8/9/11/23 images at several per-request sizes plus **every**
  configured size 1..9 on a nine-image selection (the partial last request
  keeps its square grid with its empty cells, the cap is never exceeded, an
  unusable plan is refused) and the effort rules (no tier caps the batch; the
  stall-window floors; the label/note/hint wording, including "outcome unknown
  — nothing was resent")
* `svg_runner.test.ts` — the run end to end over an in-memory FS and a fake
  **streaming** transport: 8 images as 2×4, 9 images as 4+4+1, 23 images as
  4+4+4+4+4+3, the user's batch size at every effort tier, per-request tokens
  and cost kept apart, a failed request leaving the successful one's four files
  untouched, a live request that runs 120× past the configured window (keepalive
  + deltas under fake timers), a silent stream reported as outcome unknown in
  one attempt only (retries notwithstanding), the journal written with the
  request id and cleared on completion, and a mid-stream cancel keeping the
  finished request while clearing the journal
* `svg_stream.test.ts` / `svg_stream_read.test.ts` — the SSE parser (chunk
  boundaries, deltas, `: keepalive`, usage chunk, `[DONE]`, error payload,
  unreadable frames counted) and the reader over a real `ReadableStream` (idle
  watchdog vs. a keepalive-reset window, stall before the first byte, user
  abort, JSON fallback, request id from the header or the stream, `onId`)
* `svg_journal.test.ts` / `svg_recovery.test.ts` — the in-flight journal
  (validated reads, corrupt = empty, id attached late, finished request
  removed, honest summary) and the restart recovery (rows marked Unknown with
  the id, never Failed; "no request id" said plainly)
* `svg_strip.test.tsx` — the run strip: elapsed ticking once a second (and
  shared with the bulk bar), Cancel only while running, a finished request
  whose outcome is unknown named as such with its own elapsed time
* `svg_confirm.test.tsx` — the confirmation: request count + tier limit, one
  page per request with its own composite and exact ordered filenames,
  pagination, the empty cells of a partial last page, confirm/cancel, nothing
  sent by opening it, an honest message when a composite cannot be built, and
  the 1/3/4/5/8/9-image matrix walked page by page
* `svg_lib.test.ts`, `svg_extract.test.ts`, `svg_send.test.ts`,
  `svg_canvas.test.ts` — the SVG pure layer: provider defaults + the verified
  model id, prompt/manifest text, response split + name/title matching,
  validation/security, icon count, sidecar model + versioning, batch plan,
  composite layout, request payload, error classification, usage formatting
* `svgimgbatch.test.ts`, `svgimgpixels.test.ts`, `svg_imgprepare.test.ts`,
  `svg_imgprefs.test.ts`, `svg_imgstale.test.ts`, `svg_imgjournal.test.ts`,
  `svg_imgconfirm_batch.test.tsx`, `svg_imgreview.test.tsx`,
  `svg_imgrunner.test.ts`, `svg_imgreg_ui.test.tsx` — image-edit grouping,
  normalized resized crops, exact reference preview, validated preference,
  stale-pair refusal, unknown-request metadata, one multipart composite per
  request, explicit Apply/Discard, per-pair versions and Stop, the spend each
  image version keeps and the row's "Image gen." usage (2026-10-19)
* `svg_bg.test.ts`, `svg_cost.test.ts` — the preview-background rules (presets,
  hex validation, stored-payload fallback, the black-vs-background contrast
  rule) and the cost rules (verified rate card + version, provider-reported vs
  batch share vs rate card, the wording every surface uses, reported and
  estimated totals kept apart)
* `svg_cost_io.test.ts` — cost through the real write path: provider-reported
  numbers stored as reported, a batch share stored as Estimated, the rate card
  used only when nothing was reported, a charged-but-invalid result keeping its
  usage, the sidecar read back after a "restart", and a legacy record without
  cost reading as unknown instead of crashing a row
* `svg_scan.test.ts` — the scan orchestrator (RULE 8): one complete snapshot
  per commit, a boot/rescan of an unchanged folder rebuilding identical rows,
  the overlap gate, and the key that decides "nothing changed"
* `svg_io.test.ts` — the SVG IO layer: approved-only discovery + every approved
  pair kept with its per-file reasons (missing AI image, unreadable file,
  record-only pair), byte-identical discovery whatever the enumeration order,
  a scan that writes nothing, scan + remembered root, row model, the
  write order (validate first, never overwrite, failure records), runner
  events, the review decision + its undo patch, the state reducer, preview
* `svg_preview.test.ts` — the preview pipeline end to end: a document without
  `xmlns`, an XML prolog / doctype / comment, an unbound `xlink` prefix, px
  `width`/`height` with no `viewBox`, `%` sizes with no box, varied boxes
  (24×24 / 64×32 / 512×128 / negative origin), `currentColor` resolved as a
  standalone document resolves it (never an app-chosen ink — explicit colours
  and the author's own `color:` survive byte-for-byte), an author
  `style` that would fight the fit, script/`on*`/`javascript:`/remote-URL
  removal, safe vs importing `@import`/`url()` stylesheets, id scoping (in
  markup and inside `<style>`), and every failure reason (empty ≠ broken);
  plus `previewTargetOf` — the one version the row previews and copies — the
  CSS contracts (one `--svg-thumb` value behind both previews and the row, no
  `filter` on the artwork, the contrast hint as a frame outline), and a
  multicolour document (gradient stops, fills, strokes, dash, opacity) carried
  through with only its ids scoped
* `svg_queue_ui.test.tsx` — the real panel + streaming transport: bulk Generate
  still includes existing and empty rows; bulk Regenerate filters a mixed
  selection to several existing SVGs, confirms the exact preview/request, leaves
  the empty row untouched, and appends behind an in-flight request; a row's
  Regenerate still jumps to the front
* `svg_version_chips.test.tsx` — SVG version chips: valid versions only, shown
  one active, a click switches preview/tag/pair file, dialog path kept
* `svg_pinned_bulkbar.test.tsx` — the bulk bar's sticky pin: CSS rule, direct
  child of the tab column, between controls and rows
* `svg_preview_stroke.test.tsx` — preview stroke width: lib parsing, the shared
  sheet restyles row thumbnails without rewriting them, Reset/"default", bad
  text, persistence, dialogs keep real widths
* `svg_ui.test.tsx` + `svg_ui_config.test.tsx` (fixture `helpers/svgpanel.tsx`) — DOM: approved rows only, newest SVG beside its source,
  bulk header checkbox + disabled bulk actions, filters, the code dialog and
  its Escape close, the confirm-before-send guard, approve + undo, and the
  preview frame: inline `<svg>` with `xmlns` + `100%` + `xMidYMid meet`, the
  frame's `data-version` equal to the version Copy hands over, "Preview
  failed" + reason for a malformed file, "No SVG" for a source with none, the
  one zoom slider resizing BOTH preview boxes in step at EVERY value 48…800,
  every preview background applied to the frame while the document stays
  byte-identical, and the model card + request estimate following all four
  tiers
* `svg_runlog.test.ts` — every `RunEvent` kind maps to one `svg.*` entry with
  its stable ids (run, request, item, retry, cancel), a finished request reports
  tokens/cost/outcome/elapsed **and** the provider request id, a stalled outcome
  is a warning that says "never retried" (never an error), and the composite's
  data URL travelling on the same event never reaches the entry
