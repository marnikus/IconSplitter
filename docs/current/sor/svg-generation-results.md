# Generate SVG — results, preview, cost and review

Saved-result behaviour; request flow lives on [Generate SVG](svg-generation.md).

* Zoom: ONE value (`svg-thumb`, 48..800 px, step 4, default 84) sizes BOTH
  preview slots by their own aspect ratios (`src/lib/zoom.ts` and
  `src/ui/PairedThumbs.tsx`, I-55). Raster art is never upscaled past its
  natural height; vector art keeps its viewBox ratio. A wide pair at 800 px
  scrolls sideways rather than shrinking, stretching or overlapping the
  next slot; the preview size never changes exported SVG bytes.
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
  versioned rate card (`lib/svgpricing`, verified Requesty rates; since
  2026-10-19 it also prices the Sunburst image model). Neither is
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
