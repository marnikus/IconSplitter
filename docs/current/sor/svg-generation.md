# Generate SVG — current behaviour

Confirmed Requesty calls are the narrow RULE 20 exception. Image-source editing has its [own behaviour page](svg-image-edits.md); see [invariants/svg.md](invariants/svg.md), [SVG selectors](../selectors/svg-generation.md), [storage](STORAGE.md) and [test owners](TESTS.md).

## Behaviour and request flow

Generate SVG (adds to, never replaces, the rules above; its confirmed
provider calls are the narrow RULE 20 exception, never part of local splitting):

* Discovery reuses the Selection scan and pairing, but a row is now
  **an approved AI OUTPUT that exists on disk** (2026-10-05, I-31): a file whose
  own name carries the canonical `_AI` form (`…_AI.png`, `…_AI_7.png`,
  `…_AI_9_01.png` — a raster image, never this app's `_AI.svg` output), named by
  an approved decision — by the pair's own `pair_<hash>` id, or by an approved
  record whose `ai_result` is exactly that path (ids drift when a file moves
  between `split_NN` folders; the recorded approval does not). **One normalized
  AI path is one row** (I-32), whatever the row index, the split folder or how
  many decision records name it, in deterministic path order. Everything else is
  reported instead of listed (`Discovery.excluded` + the `svg-warn-excluded`
  banner + the log): an approved pair whose AI image is gone (`ai-missing`), a
  record with nothing left on disk (`no-files`), a record naming a reference
  image (`not-ai-output`), an approved pair of only this app's own SVG
  (`artifact`), and a second record for a path already claimed (`duplicate`) —
  the first record naming a path is that row's approval, so N records for one
  path yield one row and N−1 duplicates. A listed row that needs attention keeps
  its per-file status (`svg-problem-*` — a missing reference or an unreadable
  file never removes a row, I-22); `Discovery.unreadable` names the files that
  could not be read this scan; `Discovery.problems` counts the listed ones.
  A corrupt decision file warns and keeps the in-memory decisions.
* Generation: the editable prompt (stored locally, resettable to the
  documented default) is sent with the approved AI images as a data-URL
  `image_url` part, and the answer is **streamed** (`stream: true` +
  `stream_options: {include_usage: true}`) so the connection carries bytes
  while the model thinks. Images per request (1..9, default 4) is exactly what
  the user configured: the reasoning level never caps it (2026-10-05 — 8 images
  at 4 are two requests of 4 at low, medium, high and xhigh alike), so a larger
  selection is split into `ceil(images / configured)` API requests, each sent
  on its own (`lib/svgconfig.clampImagesPerRequest`; the panel, the
  confirmation and the runner all compute the same number). Each request's
  images are combined into ONE square PNG contact sheet —
  `columns = ceil(sqrt(n))` cells, equal squares, aspect preserved, centred,
  padded, unused cells empty — with an ordered "position — name" manifest in
  the prompt. The response is split into numbered SVG blocks and matched by
  **name AND SVG title**, never by appearance; duplicate/missing/unknown/
  out-of-range positions are reported, never guessed, and empty cells never
  produce output. A plan that cannot be mapped is refused before a byte is
  sent (`lib/svgbatch.validateBatchPlan`, fail-closed).
* Bulk selection actions (2026-10-09): **Generate selected** remains the
  existing all-checked-rows path, including rows with no SVG. **Regenerate
  selected (N)** is separate and selection-only: `N` counts checked rows with
  `row.newest !== null`; the action filters again against the current rows and
  the confirmation contains only those eligible rows. Checked rows without a
  valid generated SVG never enter that batch. The shared confirmation says
  "Confirm SVG regeneration"; both actions keep the existing validation,
  versioned-save and confirmation gates.
* Confirmation (nothing is sent by opening it): the selected count, the
  **total request count** and the configured per-request size, the
  provider/model, the sampling settings, the streaming fact and the effective
  stall window, plus one page
  per request showing that request's own contact sheet, its ordered
  `position — name` manifest, its grid size and the empty cells of a partial
  last request. Pages are built in memory as they are first shown and cached
  for the dialog's lifetime; the last partial page keeps its square cells.
* The selection is an ORDER, and the sheet is that order (2026-10-07): the icon
  order is the order the user picked, decided in ONE place
  (`lib/selectionorder.inIdOrder`) and read from it by the confirmation's plan
  (`runplan.planOf`), the dialog's own pick list, the queue's label and the
  runner's sources (`runcontrol.startRun`) — so the contact sheet the dialog
  draws is the sheet the request carries, cell for cell, whatever order the list
  happens to be sorted in. A cached page is identified by the sheet's own
  content (`lib/svgcomposite.compositeSheetKey`: page label + every source with
  its fingerprint), never by the page label alone: both single-icon plans are
  called `batch_1_1`, and a label-only cache showed the first icon the dialog
  ever built while the request carried the second. The dialog is also modal in
  the keyboard layer: while one is open only Escape acts, so no list shortcut
  (`g` especially) can silently re-plan what it is about to send.
* Per-request outcome: every request records its own status, saved/failed/
  missing counts, tokens, cost and (on failure) its redacted reason, folded
  into one run summary and shown in the run strip — the request in flight
  plus one line per finished request — which stays visible after the run
  ends. A request that got no answer is named in the run's summary line
  ("… · 1 request failed · …"), never folded into the per-image counters. A
  failed request never touches another request's files, usage or cost; a
  failure whose outcome is unknown is **never** retried and its message names
  the tier, the request id and the fact that nothing was resent.
* Waits (2026-10-05): there is **no total-duration timeout anywhere**. The
  configured value (seconds, 5–900, default 120, `svg-timeout`) is the **stall
  window**: the longest silence tolerated *between* bytes. Every read — a
  delta, a `: keepalive` comment, the usage chunk or `[DONE]` — resets it, so a
  live request may run for hours. The window is raised to the selected tier's
  floor — low 120 s, medium 300 s, high/xhigh 600 s
  (`lib/effortlimits.effectiveStallMs`) — because a stalled socket behind a
  60 s proxy must be seen by the proxy first; the card's limits line and the
  confirmation state the window that will really be used ("600s stall (high
  floor)"). The retries setting (0–5, default 2) applies only to failures the
  provider CONFIRMED (HTTP status, SSE `error` payload): a stall, an abort or a
  provider-side 408/504 is never repeated automatically, because the upstream
  may still be generating and billing it. A request that ends without `[DONE]`
  is reported as *outcome unknown* with its request id, and the in-flight
  journal (`iconSplitter.svg.inflight.v1`, `src/svg/journal.ts`) keeps that
  fact across a restart: the rows come back as **Unknown** with the id and the
  elapsed time, and the panel offers an explicit "Retry these" through the
  normal confirmation — never an automatic resend.
* Zoom: ONE value (`svg-thumb`, 48..240 px, step 4, default 84) sizes BOTH
  the AI thumbnail and the SVG preview box, the row's minimum height and the
  previews column (inline `--svg-thumb`). Both boxes are the same square and
  each artwork is contained inside it (`object-fit: contain` for the image,
  `xMidYMid meet` for the SVG), so the two previews resize in step, keep
  their aspect ratio and never overlap the next column.
* Every result is validated (well-formed XML, exactly one `<svg>` root, valid
  `viewBox` or documented dimensions, no scripts/event handlers/unsafe
  external URLs/executable content, visible geometry) before anything is
  written. An invalid response stores a safe failure record and NO SVG file,
  and the previous valid version stays exactly where it was.
* Naming/versioning: the SVG sits beside the AI image with the same base
  name; the first version is the plain `<stem>.svg`, each
  regeneration takes the next free version from disk + sidecar and never
  overwrites. The newest VALID version is previewed by default; every version
  stays reachable through the history dialog.
* Previewing a saved SVG (`src/lib/svgpreview.ts`, rendered by
  `src/svg/SvgPreview.tsx`): the saved text is parsed with the real XML parser,
  repaired once when a namespace is missing, sanitized (no scripts, no event
  handlers, no remote URLs, no `<foreignObject>`), fitted (`viewBox` from the
  declared box or from px width/height, `width/height="100%"`,
  `preserveAspectRatio="xMidYMid meet"` so strokes scale uniformly and the art
  is centred), `currentColor` resolved the way a standalone document resolves it
  (the UA default, black — the app never recolours the artwork), id-scoped per
  document, and rendered INLINE inside its own open shadow root. The saved file
  is never modified. The row's preview and its Copy/Code actions read ONE target
  (`previewTargetOf` in `src/svg/rowmodel.ts`), so they can never show
  different versions, and `rootToken` (bumped on every pick and scan) forces
  every row to re-read the file it shows. Empty (no SVG yet) and broken
  (un-previewable file) are different states: the frame says "No SVG" or
  "Preview failed" + the reason. Design + root cause:
  `docs/archive/2026-10-01-svg-preview-rendering/design.md`.
* Per-file metadata: `<stem>.svg.json` beside the AI image (no global SVG
  decision file), written tmp → verify → overwrite → cleanup. Missing sidecar
  = pending; a corrupt sidecar warns and never destroys the SVG files. Each
  version records the source path/fingerprint, the SVG path/version, the
  generation and review status, the exact prompt, provider+model, request and
  completion timestamps, input/output/total tokens when reported, the cost with
  its currency, basis and **pricing version**, the validation result and a
  redacted error.
* Tokens & cost: every task/version shows tokens **and** the cost beside them —
  in the row, in the version history and in the run summary. A provider-reported
  number is shown as "reported"; a calculated one is always labelled
  **Estimated** and names its pricing version. The calculation is either the
  image's share of a batch total or, when no cost was reported at all, the
  versioned rate card (`lib/svgpricing`, verified Requesty rates). Neither is
  ever presented as provider-reported, and a missing number is shown as "—" and
  never invented.
* Preview background (prompt §16): the SVG preview sits in a frame whose colour
  the user picks — White / Black / Gray / Green / Red plus a custom colour —
  applied as a CSS background of the wrapper, so **no SVG document, fill,
  sidecar or export is ever modified** by it. The choice is persisted with the
  tab's view prefs and restored on the next visit. Where the chosen colour
  leaves black artwork under 3:1 contrast (WCAG non-text), the FRAME gets a
  light outline so black strokes stay visible — the artwork is never filtered,
  inverted or recoloured. Inside a frame the inline preview host paints nothing
  of its own, so the chosen colour is what the artwork is actually painted on.
* The preview never writes colour into the artwork: the inline stylesheet is
  layout only (no `color`, `stroke`, `fill`, `filter` or `opacity` rules), the
  document's own colours survive byte-for-byte, and a `currentColor` icon
  resolves through the weakest possible declaration — a `color` presentation
  attribute on the root, written only when the document declares no colour of
  its own — exactly as the standalone file would. Copy/Code always hand over
  the saved bytes.
* Review: a new valid SVG starts **pending**; Approve/Decline act on the
  selection (one history entry per gesture, undoable). The approved version
  is identified in the row; regenerating adds a new pending version without
  deleting old decisions or history.
* Regenerate SVG from (2026-10-09; design `docs/archive/2026-10-09-regenerate-from-svg/design.md`).
  Feature 1 (the default, locked by tests): a row's Regenerate sends the FULL
  main prompt plus the source's first image alone, one request. Feature 2:
  the Generate SVG tab's window **Regenerate SVG from** (global, directly above
  the prompt window; moved here from Export settings on 2026-10-09) →
  **Regenerate from current SVG** sends the saved prompt picked from the SVG
  prompt presets, the icon's newest valid SVG code and the same first image,
  one icon per request (I-64). A missing or blank saved prompt refuses the run
  before any byte leaves; an icon with no valid SVG yet gets the main prompt.
* Failures: a failed request keeps the previous SVG; a rate limit reports its
  retry-after; cancellation stops unsent requests and keeps completed
  results; a restart marks an interrupted request as interrupted/unknown and
  never blindly resubmits; a save failure keeps the validated SVG recoverable.
* The API key is user-provided, stored in the browser's IndexedDB secret
  store (memory-only fallback), masked in the UI, redacted in every error and
  excluded from presets/reports/exports (RULE 20).
