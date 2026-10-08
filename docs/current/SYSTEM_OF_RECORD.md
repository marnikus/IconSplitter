# System of Record — Icon Splitter

Current behaviour, invariants and flows. If code and this doc disagree, one of
them is wrong — fix the wrong one in the same change (AGENT_RULES RULE 17).
Adapted structure from `Process-Images-in-Areana/docs/current/SYSTEM_OF_RECORD.md`.

<!-- ideal-size: 1800 lines reason=RULE 17 keeps all six modes' authoritative behaviour in one
     current file; the domain split (index here + docs/current/sor/*) is an owner-approved
     follow-up planned in docs/archive/2026-10-07-env-setup-performance/design.md (O4). -->

**How to read this file (context budget — `AGENTS.md` §2):** do not read it end
to end. Jump to the section your task touches: §2 behaviour per mode · §3 state
model · §5 invariants (`I-<n>`, the unit every rule and commit quotes) · §6
storage map · §7 modules · §8 test inventory · §11 UI inventory. §12–§20 are
dated deep-dives of behaviour that is still current — read one only when your
task names it. Appending a mode/flow? Update §2 + §5 + the matching inventory.

## 1. What this is

A browser app with six modes (top tabs, `src/ui/Workbench.tsx`):

1. **Single sheets** — detect individual icons in a sprite sheet, review,
   resize and exclude them, export equal-size square PNGs (ZIP / downloads /
   folder / clipboard).
2. **Batch folders** (Chrome/Edge only, File System Access API) — pick a root
   folder, recursively scan every `*_AI*` image, review and select them, split
   each into its own organised output tree beside the sources, with presets
   and per-reference JSON status tracking.
3. **Selection** (Chrome/Edge only) — recursively scan a root, pair every
   original with its `_AI` result, review them side by side and store an
   approve/decline decision per pair in the pair's own `<stem>.svg.json` (I-41).
4. **Selection V2** (Chrome/Edge only) — the same discovery, decisions and
   decision file as mode 3, presented as the template-driven
   `design/selection tab V2/v2 selection tab.html` design: a full-width
   **list review** with paired thumbnails, a thumbnail zoom slider, real
   multi-selection and bulk approve, plus a switchable **comparison** layout.
5. **Generate SVG** (Chrome/Edge only) — recursively scans the same root and
   keeps ONLY the pairs the Selection workflow approved, sends each approved
   AI image (alone or as a square contact sheet of up to 9) to Requesty's
   OpenAI-compatible chat endpoint, and saves one validated SVG per source
   beside that source's AI image, versioned (`_v2`, `_v3`…) with a per-file
   `<stem>.svg.json` sidecar. Nothing is uploaded anywhere; the API key lives
   only in this browser.
6. **SVG to upload** (Chrome/Edge only) — prepares the APPROVED SVG icons for
   external stock/print websites. Recursively discovers one row per pair with
   a valid approved SVG (through the pair sidecars; `export/` is never
   scanned, so export output never feeds discovery), applies
   padding/background/stroke settings (global defaults + per-icon overrides),
   generates conceptual metadata with Gemini (the exact prompt, confirmed
   before any send), optimizes the export SVG copy with SVGO, renders a 15.1
   MP JPEG from the vectors, optionally writes a genuine EPS, and commits a
   validated per-icon package (`<pair-folder>/export/<base>.svg|.jpg|.eps` +
   one `export.json`) atomically. The approved source and its sidecar are
   never touched. There is NO automatic website uploading — the package is the
   deliverable.

Stack: React 19 + Vite 7 + TypeScript + Tailwind 4, `jszip` for archives.
Production build is one self-contained `dist/index.html`
(`vite-plugin-singlefile`) that runs offline with no server (RULE 20).

## 2. Current behaviour (authoritative)

Single sheets:

* Drop or choose image files (PNG/JPG/WEBP). Non-images are filtered with a message.
* Each sheet is analyzed (background colour, ink mask, threshold) and icons are
  detected automatically; merge distance is adjustable per sheet with an auto default.
* Detected boxes render over the sheet preview; clicking a box toggles exclude/include.
* Export: every included icon becomes a centred square (largest icon side +
  padding %), optionally transparent, optionally fixed size; delivered as ZIP,
  individual downloads, folder save, or single-icon clipboard copy.

Batch folders:

* Pick a source root (readwrite handle). Recursively scans all images; the
  output folder `_split_output` is ignored during scans (configurable list).
* Only `name_AI.ext` images with an optional numeric tail (`name_AI_7.ext`,
  `name_AI_9_01.ext` — the shapes batch outputs use) are eligible; the reference
  `name.ext` is linked, never processed, and copied into every `split_NN`
  subfolder. Missing reference → warning + user may skip or continue.
* Review window: thumbnail, filename, relPath, status badge
  (unprocessed/processed/skipped/changed/missing/deleted), checkbox, Select/Deselect All.
* Presets store every configurable value (source/dest handles in IndexedDB,
  config in localStorage); last-used preset restores automatically.
* Processing: rescan runs before each batch; per-item progress, per-item
  failure isolation, Stop button honoured between items.
* Output tree: `<root>/_split_output/YYYY-MM/YYYY-MM-DD_HH-mm-ss/<src-hierarchy>/<src-stem>/split_NN/<stem>_NN.png`
  (+ reference copy), or the same structure directly inside a custom destination.
  Never overwrites; collisions get `_v02…` appended after any existing `_AI_7`.
* State JSON `<base>.json` lives beside the reference; refreshed after every
  scan and batch; corrupt payloads are rejected and rebuilt (RULE 13).
* "Open in File Explorer" is impossible from a browser — the action copies the
  path and says so honestly (RULE 4/9).

Selection:

* Recursive scan pairs `name.ext` with `name_AI.ext` incl. numeric tails
  (`name_AI_9_01.ext`; stable `pair_<hash>` ids, dir-scoped); unpaired files surface as
  "AI result missing" / "Original missing", never silently dropped.
* **The scan is deterministic and atomic (2026-10-05).** `walkTree` sorts
  every folder itself (case-insensitive name order), so the filesystem's own
  enumeration order — which the File System spec explicitly leaves
  unspecified — never reaches the algorithm. `pairEntries` is a function of
  the file *set*: for one pair id the raster result beats the `.svg` artifact,
  the list comes out in `(folder, base, suffix)` order, and a versioned output
  (`X_AI_v2.svg`) is ignored rather than invented as a source row.
* A read that fails (locked / being replaced mid-write) is **not** data: the
  walk retries once, then marks the file `unreadable` with its path — `size 0`
  alone is never evidence, an unreadable file is never reported as changed or
  gone, and a scan performs **zero writes** inside the root (the decision file
  is created by the first save, not by opening a folder).
* One scan may commit: a monotonic ticket (`lib/scanseq`) means an older scan
  that resolves later commits nothing, and an unchanged snapshot commits
  nothing at all (no row replacement, no churn). A completed scan is committed
  in one block, after which only the best-effort id→path cache write is left.
* Review list: thumbnail, filename, relative folder, creation date, status
  chip with text + glyph; search, month / custom-range date filters, status
  filter, sorting by date/status/name/path in both directions, counters.
* Comparison: side-by-side panes with preserved aspect ratio, dims / format /
  size / path per side, 1:1 zoom with synced scrolling, hotkeys A/D/arrows/
  Space/Ctrl+K, auto-advance to the next pending after each decision.
* Decisions persist in `<root>/review-decisions.json` (atomic tmp-verify-
  overwrite protocol); a missing file is reported (not created — reading never
  writes; the first save creates it); corrupt file raises a warning and
  previous in-memory decisions are kept; write failures keep the change in
  memory with a Retry action.
* Rescan diffs added/renamed/removed/unchanged; decisions travel across
  renames via size+mtime identity; orphan records are retained so a
  transiently missing file never destroys a decision.
* A watcher re-scans every 30 s while a root is open (toggleable).

Selection V2 (adds to, never replaces, the rules above):

* Two layouts over one state: **List review** (full width, no comparison
  panel, one pair per row showing BOTH an Original and an AI result thumbnail,
  each labelled) and **Comparison** (the V1 `CompareView` panes + a pair
  picker). Layout, filters, selection and decisions survive switching.
* Thumbnail zoom: range slider **48–800 px, step 4, default 84** with a live
  "128 px" readout and both bounds shown; row and thumbnail height follow it
  while dragging, width comes from the image's own aspect ratio (never
  stretched, never upscaled past natural height, never capped). Persisted
  across restarts. This and Generate SVG's `svg-thumb` are the SAME control:
  the range, the clamp and the box rule live in `src/lib/zoom.ts`, the two-slot
  layout in `src/ui/PairedThumbs.tsx`, and neither tab may compute a box of its
  own (I-55) — an 800 px pair is honoured by letting the list scroll sideways,
  which is why the preview column is `max-content` at every breakpoint.
* Checkbox selection is separate state keyed by `pair_<hash>`, so sorting and
  filtering never lose it: header checkbox (checked / unchecked /
  indeterminate), Select visible, Deselect all, and live counts for selected,
  visible, checked-but-hidden and checked-but-incomplete.
* Bulk review — **Approve selected** / **Approve visible list**: the affected
  count is shown and the button arms before applying (Escape or Cancel
  disarms); one operation = one transition, one file write, one toast. A
  failed write keeps the change in memory with Retry.
* The **active row** (keyboard target, `aria-current`, scrolled into view) is
  distinct from a **checked row** (bulk target). `A` / `D` decide the active
  row; "Next pending after a decision" advances it.
* Extra filter: **Pairing** = all / complete / missing pair.

Everything above runs client-side; nothing is uploaded anywhere.

Generate SVG (adds to, never replaces, the rules above — and is the one mode
that makes a network call, only when the user asks it to):

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
* Failures: a failed request keeps the previous SVG; a rate limit reports its
  retry-after; cancellation stops unsent requests and keeps completed
  results; a restart marks an interrupted request as interrupted/unknown and
  never blindly resubmits; a save failure keeps the validated SVG recoverable.
* The API key is user-provided, stored in the browser's IndexedDB secret
  store (memory-only fallback), masked in the UI, redacted in every error and
  excluded from presets/reports/exports (RULE 20).

SVG to upload (adds to, never replaces, the rules above — and is the second
mode that makes a network call, only when the user confirms it, the same
opt-in class as Generate SVG → Requesty; design
`docs/archive/2026-10-06-svg-to-upload/design.md`):

* Discovery walks the root ignoring `export`, reads every `.svg.json` sidecar
  and lists ONE row per pair with ≥1 valid approved SVG version; the export
  source is the NEWEST approved valid version. Pairs without an approved valid
  SVG, without a sidecar, outside the split scope and duplicates are reported
  in a banner with their reasons, never listed. Export output is never a
  discovery source (no export loops).
* Settings: global defaults (padding %, background — `transparent` (the
  default) or one hex, stroke width in px — the file's own units, written as
  typed (2026-10-08; a stored `strokePt` from before reads as the same number
  under `strokePx`), stroke
  colour — one hex, `#000000` by default (2026-10-08), or the artwork's own,
  JPEG target MP, JPEG quality, SVGO
  optimize on, optional EPS, artboard) plus per-icon overrides; the effective
  settings are defaults under,
  overrides on top, and the settings dialog marks every field inherited or
  overridden. "Apply settings to selected" pins the current defaults onto the
  selection as ONE undoable `uploadSettings` history entry; per-icon set/reset
  pushes one entry each; global-defaults edits are persisted but NOT undoable
  (the same class as presets). The checkbox selection is session-persisted but
  not on the undo timeline.
* The artboard (2026-10-08) is one more settings field, with three modes:
  `content` (the artboard hugs the artwork, as before), a square px preset
  (256/512/1024/2048/4096 — "512×512 and other popular") or an exact CUSTOM
  W×H, which is what lets the user set the output aspect ratio. Read back
  through `clampArtboard`: 16–8192 px per edge, a 64 MP total area ceiling that
  shrinks BOTH edges together so the ratio survives, and a preset that snaps to
  the nearest offered size; a corrupt value becomes `content`. Only a
  non-`content` artboard is written into the stored overrides.
* The JPEG resolution is NEVER blocked by the artboard (2026-10-08, the user's
  correction: "a small artboard must not cap the resolution"). `jpegMatchArtboard`
  (default true) says whether the JPEG follows a PINNED artboard's exact px;
  unticking it — which typing a megapixel value does in the same gesture —
  renders `jpegMegapixels` instead while keeping the artboard's aspect ratio, so
  a 512×512 artboard can still ship an 8000×8000 JPEG. With a `content`
  artboard the question does not exist (the artboard follows the MP), so the
  checkbox is not shown. Both the flag and the megapixels are ordinary settings
  (defaults + per-icon overrides), the flag is in the fingerprint because it
  changes the output, and the ONE canonical `SETTINGS_FIELDS` list (which
  `overridesEqual` in the undo path derives from) names every overrideable
  field, so a change confined to the artboard or the flag can never be
  swallowed as "nothing changed".
* Geometry: the visible bounds include strokes (width/caps/joins), transforms
  and non-scaling-stroke; unsupported elements (text, image, use,
  foreignObject, risky `<style>`) are named, never guessed. The artwork is
  fitted proportionally into the padded artboard: in `content` mode the padding
  is a uniform % of the artwork's largest side, and on a PINNED artboard it is
  a % of the TARGET's largest side while the artwork is scaled by one uniform
  factor and centred (letterboxed — never stretched, never cropped), the pinned
  px are exact (`viewBox="0 0 W H"`). **Every transform is baked into the
  geometry** (2026-10-08, `lib/upload/bake`): the artwork's own `transform`s
  and the artboard's translate+scale become the shapes' coordinates (3
  decimals, in artboard px), so the shipped file carries NO `transform` and no
  wrapper group — a rect/ellipse/line/polyline/polygon keeps its element under
  an axis-aligned matrix, a circle under a uniform one, anything rotated or
  skewed (a rounded rect included, 2026-10-08) becomes a `<path>` from the one
  outline model (`geom/outline.ts` + `geom/ops.ts` + `geom/shapes.ts`, shared
  with the EPS writer). The stroke width is written AFTER that bake,
  **verbatim: the number in the setting is the number in the file**
  (`strokePx: 2` → `stroke-width="2"` on every visible stroke, whatever the
  artwork's transform or the artboard's scale — the reviewer's
  `2.6224000000000003` was a width finalised in local units that SVGO
  re-multiplied when it baked the transforms; with nothing left to bake the
  optimizer cannot touch a width, and the export test pins the SHIPPED text).
  A stroke width of 0 keeps the artwork's own strokes: each width follows its
  geometry (× the baked scale, ≤ 3 decimals; a `non-scaling-stroke` keeps its
  number and loses the attribute), dash arrays/offsets scale the same way, and
  containers lose their `stroke-width` because every shape now carries its
  own. What a bake would distort is refused by name before the tree is touched
  (`unsupported: a stroked <path> under a non-uniform transform`, `a
  userSpaceOnUse <linearGradient>`, `a <clipPath>` / `<mask>` / `<filter>` /
  `<pattern>`) — a deliberate narrowing recorded in the 2026-10-08
  stroke-width design (the `a rounded <rect> under a rotation or skew` refusal
  of that design was retired the same day: the outline model now draws rounded
  corners, so the rect bakes to a `<path>`); a stroke COLOUR
  other than "artwork" is written onto every element that strokes visibly
  (fills, `stroke="none"` and gradient/pattern strokes are never touched, and
  a `currentColor` stroke becomes the chosen hex). **Each stroke property is
  then defined ONCE** (`lib/upload/strokeglobal.ts`, 2026-10-08 — the stock
  reviewer's `<svg stroke="#111"><g stroke="#000" stroke-width=".8">` with a
  width on every path): when every visibly stroked shape agrees on `stroke`
  (or `stroke-width`) the root carries it and no other element or inline
  style does — the group's `.8`, the per-path widths, the source root's own
  colour all go — and a shape that does not stroke (the background rect, a
  filled shape) says `stroke="none"` so the root's paint cannot reach it;
  when the shapes disagree (`artwork` colour over a mixed source, width 0
  over mixed widths) each stroked shape states its own and no container or
  root states any; when nothing strokes, nothing is written. With the
  defaults a line icon therefore ships `<svg stroke="#000" stroke-width="2">`
  and no other definition of either (the export test pins the SHIPPED text
  through SVGO; `PreparedSvg.globalStroke` records what the root defines).
  The root carries NO
  `width`/`height` — the `viewBox` is the size (every consumer that needs px
  — the rasterizer, the EPS — derives them; the browser rasterizer pins the
  render size on an in-memory copy only). A `transparent` background (the
  default) paints no rectangle in the SVG or the EPS; a colour paints one
  fill-only rectangle in both; the JPEG, which cannot be transparent, flattens
  onto the colour or onto white. The JPEG
  rasterizes the VECTORS directly — at the artboard's px while
  `jpegMatchArtboard` is on, otherwise at the integer MP target in the
  artboard's ratio (15.1 MP on a square artboard → 3886×3886; 4 MP on 512×256 →
  2828×1414) — verified by decoding the SOF back. All of it happens on an export
  COPY — the approved source is never written.
* The metadata prompt (2026-10-07 UI fix): it lives in its OWN large panel
  beside the Gemini card — never inside it — and it is EDITABLE and persisted
  (`iconSplitter.upload.prompt.v1`): the text the editor shows is the text the
  one confirmed request carries, the text the confirmation dialog previews, and
  the text the export record names (honesty: one prompt, one owner). Presets are
  named snapshots under `iconSplitter.upload.prompts.v1` with their own row —
  the saved list, Quick load, Delete, and Save as with a name field (a new name
  goes first, an existing one is replaced in place; max 50, names 1–60 chars,
  text ≤ 8000 chars, all validated on read). Editing the prompt never relaxes
  the POLICY: the validator keeps enforcing the rules the default prompt states,
  and the panel says so out loud.
* Metadata: Gemini (`gemini-3.1-flash-lite`, `x-goog-api-key` header, key in
  IndexedDB under `gemini-api-key`, masked/redacted everywhere) answers the
  prompt above (the documented default until the user edits it); the answer is
  parsed deterministically (three labeled
  lines) and validated against a MINIMUM policy (2026-10-07, "no need be
  strict"): at least 10 unique tags — case-insensitively unique, and the list
  must still contain the 7 mandatory terms — a title of at least 5 words and a
  description of at least 7 words, where a hyphenated compound counts as ONE
  word; nothing is refused for being longer, and duplicates or a missing
  mandatory term are errors. IP-claim phrases and restricted-content hits are
  warnings only — they never block the accept (the prompt forbids them).
  Errors are verbatim and actionable (`tags must be at least 10 (got N)`,
  `title must be at least 5 words (got N)`, `description must be at least 7
  words (got N)`, `missing mandatory tags: …`). 2026-10-08: duplicates are
  removed SILENTLY before validation — case-insensitively, first spelling kept,
  order kept, blanks dropped (`dedupeTags`), and the ≥10 minimum counts the
  DEDUPED list, so a tag written twice is never a refusal or a warning. The
  fields
  under each row are editable and copiable, empty until generated; Accept
  re-validates and persists through the embed commit. The confirmation dialog shows the exact
  request (prompt, endpoint, auth rule) before any paid send; a timeout or
  disconnect is NEVER resent automatically (no duplicate paid submission);
  in-flight requests are journalled and reported `interrupted` after a restart.
* Clean export SVG (2026-10-08, the user's clean-code rule): the file that
  ships is SVG 1.1 (`version="1.1"` re-added after SVGO, which strips it), holds
  a real four-number `viewBox`, contains no raster content anywhere (an
  `<image>` or a `data:image/…` URI is refused outright — it cannot be cleaned
  without changing the picture), no root `width`/`height` (the viewBox is the
  size), no editor bloat (comments, foreign elements and attributes; namespace
  declarations live ONCE on the root and only for prefixes the document uses —
  `xlink` when referenced, `rdf`/`dc` for the embedded metadata, which the embed
  step declares on the root instead of on every `dc:*` element (2026-10-08,
  stock review); an `xmlns:*` below the root or an unused one is a violation
  the rebuild pass hoists or drops), and NO naming — no
  `id`, `class`, `data-*`, `aria-*`, `role`, `xml:space`, `enable-background`
  and no generator comments; the only surviving id is one the artwork really
  references, renamed `a`, `b`, … with every `url(#…)`/`href="#…"` rewritten to
  match. A paint-only `<style>` block or `style=""` is FOLDED into the elements
  (paint properties only — anything that could move, hide or clip geometry is
  refused as `unsupported` with the reason, never guessed at), which is what
  lets the class names go. The policy runs three times — at prepare, after the
  optimizer and as the last check before commit — from ONE rule list, so the
  check and the fix can never disagree; an unparseable or unfixable document is
  reported with its violation instead of shipping, and the file the export
  COMMITS is re-verified from its own text, not from the copy that was built.
  The background rectangle the prepare pass paints (only for a colour
  background) is fill-ONLY (`stroke="none"`, 2026-10-08): `stroke` is
  inherited, so an artwork that strokes on the root or a group would otherwise
  put a border around the whole artboard. The `<metadata>` subtree is the one
  place the clean pass leaves alone for both the check and the rebuild — it is
  the embed step's output (RDF/DC vocabulary by design), verified by its own
  readback, and the namespace rule still covers it (a declaration inside it is
  a violation, hoisted to the root).
* Metadata title AND description (2026-10-08, stock review; corrected the
  same day — the first version CUT the second sentence, which lost the
  model's words): clean text — `cleanPhrase` keeps the WHOLE text, every
  sentence, strips only the END punctuation `.`, `!`, `;`, `:`, `,`, `…` (a
  `?` stays: a question is a phrase; punctuation between sentences stays) and
  writes sentence case per sentence (each sentence's first letter up — a
  sentence starts after `.`/`!`/`?` + space following a word of 2+ letters,
  so `2.5`, `e.g.`, a `;` and an ellipsis do not start one — every later
  Capitalised word down; `SEO`, `iOS` and a lone `A` untouched). "Collaborative
  Unity Promoting Collective Social Empathy. Icon of charity and community."
  ships as `<title>Collaborative unity promoting collective social empathy.
  Icon of charity and community</title>` (and the same text in `<dc:title>`). `cleanMetadata` applies it to both
  fields at every gate the text passes: the model's answer
  (`parseMetadata`), the accepted-metadata cache on read, the Accept button
  (an edit) and the committed `export.json` block a reload reads back
  (`metaFromRecord`); the fingerprint is over the cleaned text, so a
  remembered or exported answer the rule changes no longer matches its stored
  fingerprint — the row shows stale and the next export re-embeds the file
  without a model call. It is a SHAPE rule, never a refusal, and it never
  removes words. The prompt still ASKS for one phrase ("ONE phrase … sentence
  case, no period") for both lines; an answer that comes back as two sentences
  is kept as written, minus its final period.
* Export: the stage planner re-runs only what changed (a metadata edit re-embeds
  — no AI, no render; a missing output rebuilds just that output; nothing
  changed → no work). Every output validates before it commits (SVG parses +
  metadata readback; JPEG decodes at the recorded dims + XMP readback; EPS
  header + bounding box) and commits atomically (tmp → verify → overwrite →
  cleanup, `export.json` LAST as the commit marker), so a crash mid-commit
  leaves the last valid package in place. EPS is a genuine writer for a
  documented subset; anything outside fails that stage honestly → `partial`
  (SVG/JPEG stay committed). A **rounded `<rect>`** is INSIDE the subset
  (2026-10-08, design `docs/archive/2026-10-08-eps-rounded-rect/design.md`):
  the one outline model (`geom/shapes.ts`) draws it exactly — four lines and
  four KAPPA quarter-ellipses, the SVG radius rules applied (a missing radius
  copies the other, each clamped to half its side, 0 → a plain rect) — so the
  EPS stage succeeds with NO distortion and no question asked; the writer
  REPORTS the adjustment instead: `fixes: ["1 rounded <rect> written as an
  exact path outline"]` on its ok result → `tools.eps.fixes` in `export.json`
  (absent on pre-fix packages = none) → the row's amber note
  (`upload-note-{id}`, `UploadRow.note`; the row stays `processed`, `error`
  stays empty) → the `exported` log line (`EPS auto-fixed: …`) → the batch
  toast's tail (`· N EPS auto-fixed`, only when N > 0). The same outline lets
  a rounded rect under a rotation or skew bake to a `<path>` like any turned
  shape (the former "a rounded <rect> under a rotation or skew" refusal is
  gone). Green (`processed`) only when every requested
  output validated and committed; `stale` when fingerprints moved since the
  last commit.
* Download all (2026-10-08, design
  `docs/archive/2026-10-08-upload-download-all/design.md`): the bulk bar's
  `⤓ Download all (N files)` copies the SELECTION's committed packages into ONE
  folder the user picks in the browser's folder dialog (`pickDirectory`, a
  destination — no path capture, nothing remembered, no scan). What is copied
  is what each row's `export.json` names and the disk has (`outputs.svg/jpg/
  eps`, never `export.json` itself), byte for byte under the artifact's own
  name; the pure planner (`lib/upload/download.ts`) keeps two icons with one
  stem apart (`fog (2).*`, all three files of the package together) and is
  what the button's count reads, so the count and the write agree. RULE 23
  holds in the destination: `writeFileNew`, a name already there is KEPT and
  counted, every write is read back and compared (a mismatch is removed and
  counted `failed`), and one file's failure never stops the next (RULE 5). A
  selected row with no record is "not exported yet", counted, never guessed
  at. One line says it all — toast and the log's `downloaded` entry (counts in
  text, no data): `Saved 9 files (3 icons) to stock-drop · 2 kept (already
  there) · 1 icon not exported yet`.
* Restart precedence (P2.6 — the two interruption models reconciled): there are
  TWO independent memories of work that did not finish, and they never silently
  disagree. **Disk wins on scan**: `export.json` beside the outputs is the
  authority — a record that says `processed` is shown as processed even when a
  stale in-memory state says otherwise, because the package really is on disk.
  **Memory wins within a session** and only for what disk cannot know: the
  in-flight journal (`…upload.journal.v1`, a metadata request whose outcome is
  unknown) and the job store (`…upload.jobs.v1`, a run that was `queued`/`running`
  at close / crash). Both are read at assembly; a row with no committed record
  shows `interrupted`, never a quiet `discovered`, and the restore note is
  emitted exactly ONCE per page load (StrictMode's double-invoke included), so
  a remount cannot re-report or re-send. A run marks itself `queued` → `running`
  before it starts and writes its terminal state after the commit, which is why
  a crash mid-run can be reported honestly instead of guessed.
* Row layout (2026-10-07 UI fix): the row detail is TEXT ONLY — the committed
  artifact is not rendered inline (a 3886 px JPEG in the detail was the "huge
  icon below"; that preview is deferred). What replaced it is the LOCATION
  action: it copies the pair's export folder path with the same shared code the
  Generate SVG tab's Location uses (`lib/copypath` → `folderCopyText`), naming
  the committed artifact when there is one and the planned package path before
  the first export. The reference's tool block is honoured too: the global
  Export settings button sits in the bulk bar beside the zoom controls, and the
  Gemini card is one contained grid (Model, Endpoint on its own full-width row,
  Timeout, Retries, Parallel, then the check row) so no control can overlap or
  leave its box.
* The confirmation shows the image it sends (2026-10-07): the metadata dialog
  renders, BEFORE anything is paid for, the very bytes the request will carry —
  one 512 px JPEG per selected icon, each read from that icon's OWN approved SVG
  and captioned with its file name (`upload-preview-{id}` +
  `upload-preview-caption-{id}`). The prepared data URL is bound to the pair id
  AND the SVG's `size:mtime` fingerprint (`lib/upload/sentpreview.previewFor`);
  the runner sends it unchanged when both still match and re-renders that icon's
  own document when they do not, so a stale or neighbouring icon's picture can
  never travel. `upload-meta-confirm` stays disabled until the previews are
  ready, the strip is bounded (24, `PREVIEW_LIMIT`) and says how many it left
  out, one unrenderable icon never costs the others their preview, and the
  caption reads "… · image/jpeg · 512×512 · N.N KB · sent unchanged". Both row
  previews (this tab and Generate SVG) now read their document through ONE hook
  (`svg/usesvgtext`), which returns a text only for the folder generation +
  path it was read for — a row can never paint another row's artwork.
* Model check (CP-8): the provider card can ask the provider's own model list
  (`GET {base}/models`, same `x-goog-api-key` header, same bounded request
  window) and reports found / missing / failed. The configured id is NEVER
  substituted from the answer; the outcome is logged once as `model-checked`.
  A truncated answer (`finishReason` `MAX_TOKENS`/`LENGTH`) is `invalid` with the
  provider's own reason and is never accepted, even when the half-written tags
  happen to parse.
* Undo: one new entry type `uploadSettings` (`{ overrides: { [pairId]: Overrides
  | null } }` before/after) on the shared global timeline; the apply path lives
  in `src/upload/uploadundo.ts` (a mounted panel applies live; unmounted
  writes the store directly).

## 3. State model

One in-memory model, owned by `App`:

```
sheets: Sheet[]       Sheet = { id, name, base, url, img, an: Analysis,
                                boxes: Box[], autoFrac, usedFrac, manual,
                                excluded: number[] }
activeId              which sheet is shown
padding, size, transparent   export options (ExportOpts)
busy: string | null   progress surface (RULE 5)
toast: {msg, err}     honest reporting surface (RULE 2, RULE 4)
```

Detection state transitions per sheet: `loaded → analyzed → detected(auto) →
[redetected(manual frac)…]`. `excluded` is a flag set over intact `boxes`
(RULE 11); only sheet removal destroys detection work.

Batch model (`useBatch.ts`):

```
root, dest              FileSystemDirectoryHandles (dest null => auto)
rows: Row[]             Row = AiImageEntry + status + selected
keys: StateKey[]        which <base>.json files are known
preset                  Preset (split settings, ignore list, dest mode…)
busy / toast            progress + honest reporting surfaces
```

Status transitions per source record: `unprocessed → processed | skipped |
deleted`; file changed → `changed` (re-selectable); file gone at scan → `missing`
(retained in JSON); gone during processing → `deleted` (skipped safely, batch
continues).

Selection V2 model (`useSelectionV2` wraps `useSelection`, so decision,
filter and persistence state are V1's and stay single-owned):

```
core: SelectionApi      discovery, pairs + decisions, filter, sort,
                        active row (core.selectedId), write status
checked: string[]       checkbox selection (pair ids) — never a decision
prefs: ReviewPrefs      { mode: "list"|"compare", thumbHeight: 48..240 }
derived                 header check state, bulk scope
                        { affected, blocked, hidden }
```

## 4. Core flows

Single sheets:

* **Add sheets:** files → filter non-images → `loadImage` → `analyze` →
  `detect(an, null)` → sheet appended, first becomes active.
* **Review:** preview grid + SVG boundary overlay (`box-toggle-{i}`), merge
  slider re-runs `detect` with a manual fraction, `merge-reset` returns to auto.
* **Export all:** `collect()` loops sheets × included boxes → `renderIcon` →
  `canvasToBlob` (RULE 15 gate) → ZIP / sequential downloads / folder handles;
  `busy` reports `Rendering d/t…` per item (RULE 5); per-item failure is
  reported, never silently swallowed.
* **Single icon:** copy to clipboard or download one rendered blob.

Batch:

* **Scan:** root handle → `readDirTree` (ignore list) → `walkTree` (canonical
  order) → `collectAiImages` → `linkReferences` → `syncAndCollect` rewrites
  every `<base>.json` → rows render with statuses.
* **Review/SVG scan (one path, two tabs):** ticket → `readDirTree` → `walkTree`
  → `pairEntries` → decisions → complete snapshot → `scanKey` compare → one
  commit (rows, discovery, root token, checked ids) → best-effort index +
  report. Nothing is written to the root, nothing is committed by a superseded
  scan, and an unchanged snapshot commits nothing.
* **Process:** selection → rescan-derived items → `planBatch` (collision-safe
  folders) → per item: load → `splitSheet` → write `split_NN/<stem>_NN.png`
  via no-overwrite writes → copy reference per split dir → `applyOutcomes`
  persists statuses → UI mirrors (RULE 24). Stop is honoured between items.
* **Presets:** save/load/delete in localStorage; directory handles persisted
  in IndexedDB per preset name; last-used preset auto-restores on open.

## 5. Invariants

* **I-1 (RULE 6):** every export contains exactly the currently included boxes
  of currently loaded sheets.
* **I-2 (RULE 4):** "no icons detected" and "image could not be read" are
  distinct honest states — never a fake success.
* **I-3 (RULE 11):** exclusion never destroys detection work.
* **I-4 (RULE 15):** a blob is delivered only after canvas dims > 0, blob
  non-null, size > 0; otherwise the item is skipped with an error.
* **I-5 (RULE 20):** image bytes never leave the browser.
* **I-6 (RULE 22):** export names derive from one function: sanitized sheet
  base + `-icon-NN.png`, deterministic detection order.
* **I-7 (RULE 24):** every visible value mirrors current state at the moment
  of change — no value waits for another interaction to become visible.
* **I-8 (batch, RULE 23):** batch outputs never overwrite: dirs/files are
  probed `create:false` first; collisions take `_v02…`; existing `_AI_7`
  variant suffixes are preserved, never replaced.
* **I-9 (batch, RULE 6):** the `_split_output` tree is never scanned as input;
  filtered-out (missing/deleted) sources never enter a batch.
* **I-10 (batch, RULE 13):** state JSON is validated on read; corrupt payloads
  are replaced with fresh valid state, never fatal.
* **I-11 (batch, RULE 1/3):** pixel math in batch mode reuses `lib/detect` +
  `lib/render` through `splitSheet` — no second detection implementation.
* **I-12 (selection, RULE 13):** a corrupt or unwritable decision file never
  destroys decisions — in-memory records win, the user is warned, retry offered.
* **I-13 (selection, RULE 4):** "generated" never implies "approved"; a pair
  without a stored decision is pending, always.
* **I-14 (selection, a11y):** every status is text + glyph first; colour is
  reinforcement, never the only signal.
* **I-15 (selection V2, RULE 6/4):** a bulk decision touches exactly
  `checked ∩ visible ∩ complete`; hidden checks are counted and reported,
  never applied, and an incomplete pair is never approved silently.
* **I-16 (selection V2, RULE 24):** the zoom slider, the row height and the
  thumbnail height are one value; moving the slider changes all three in the
  same render, and the stored value survives a restart.
* **I-17 (SVG preview, RULE 3/14):** the preview background is an app setting —
  it lives in the frame around the preview and never in the SVG text, the
  sidecar or an export; the code dialog always shows the saved bytes.
* **I-18 (SVG cost, RULE 4):** a version's cost is either provider-reported or a
  labelled estimate; the two are never merged, never relabelled and never
  invented, and both survive a restart through the sidecar.
* **I-19 (SVG requests, RULE 6/24):** the per-request size is one value — the
  user's configured size, which no reasoning tier may shrink — and the panel,
  the confirmation and the runner compute it the same way; the confirmation
  lists every request (and its exact images) before anything is sent, and an
  unmappable plan is refused rather than partially sent.
* **I-20 (SVG runs, RULE 4/23):** one request's outcome — status, tokens, cost,
  error — is recorded and shown for that request only; a failed request never
  alters another request's files, usage or cost, and a request whose outcome
  is unknown (stall, disconnect, abort) is never resent — it is reported as
  unknown with its request id, kept in the in-flight journal and offered to the
  user for a deliberate retry. Liveness, never duration, decides when a request
  is over: only silence longer than the stall window counts as dead.
* **I-21 (SVG preview, RULE 3/24):** the preview never recolours the artwork:
  the inline stylesheet is layout only, the root colour is the document's own
  (or the UA default), and the frame's background and contrast outline stay
  outside the document.
* **I-22 (scan, RULE 3/4/24):** a scan is a pure function of the file set and
  commits once: enumeration order can never change a pair, its id, its AI side
  or the list order; an unreadable file is a status (never a fabricated size,
  never "changed"/"gone"); an approved **listed** source is never hidden while a
  file of its own is only missing (a source with no AI image is not a row at all
  — see I-31 — and is reported with its reason); a scan writes nothing into the
  scanned root; a superseded scan and an unchanged snapshot both commit nothing.
* **I-23 (the log, RULE 10/12):** one log instance for the whole app, docked by
  `Workbench` on every tab. Features write through `log()` only — no feature
  touches `iconSplitter.log.v1` — and one entry is one `LogSpec` through one
  sanitiser, so the store, the rows and the copied text can never disagree.
* **I-24 (the log, RULE 20):** an entry never carries a key, an Authorization
  header, image bytes, a composite data URL or a full payload — only a mask, a
  hash and counts. Sanitising happens on write **and** on read, so a tampered
  stored payload cannot smuggle one either.
* **I-25 (the log, RULE 13):** the stored log is validated and clamped on read
  (foreign version or corrupt JSON → the default state, never a guess), keeps at
  most the configured cap (50/100/200/500/1000, default 200) in display **and**
  storage, is debounced 150 ms and flushed on pagehide, and `clearLog()` leaves
  exactly one honest `log.cleared` entry.
* **I-26 (the log, RULE 11/24):** the dock follows new entries only while it is
  at the bottom (24 px slack), stops the moment the reader scrolls up, resumes
  when they come back, and always says which of the two states it is in.
* **I-27 (the shell, RULE 3/24 — the port's fix):** the dock occupies a **layout
  row** of one viewport column (`.app-shell` → nav, `.app-main`, `.app-dock`);
  the panels are floored at the band that is left (`.v2`, `.svg`: `min-height:
  100%`) and grow with their content, so `.app-main` — never the window — is
  what scrolls. No interactive element is ever painted under the dock, at any
  scroll position, and the app's floating toasts are lifted above the dock's
  published height (`--app-dock-h`).
* **I-28 (copies, RULE 2/9):** a "copy path" action yields a **folder** path,
  never a file name: the folder that holds the file the action was made from
  (I-56 — reversed 2026-10-06 from the older "stop at the batch folder" rule).
  The text uses backslashes throughout, and a blocked clipboard is reported as
  an error instead of being swallowed.
* **I-29 (full path, RULE 13/20):** the full path of a picked root is
  remembered per **folder name** in `iconSplitter.rootpaths.v1`, normalised on
  write (Explorer's surrounding quotes, forward slashes, trailing and doubled
  separators, UNC pairs kept) and validated on read — corrupt or hand-edited
  payload means no memory, never a guess, and the app never invents a drive.
  With no memory the copy falls back to the folder's own name.
* **I-30 (root picking, RULE 4/10):** the Generate SVG tab can always point
  itself at a folder — the picker is offered whether or not a root is loaded,
  because the Selection tab's handle is a fallback for the first run, not a
  lock — and each tab has exactly one picker control.
* **I-35 (the pick captures the path, RULE 4/13):** every way of pointing the app
  at a folder to scan goes through `ui/pickroot.pickRootWithPath()`, which
  captures the picked folder's real path from the clipboard when that text names
  the folder (exactly, or completed from its parent) and remembers it. The app
  never invents a path: text that does not name the folder is not stored, and
  what was captured is stated to the user.
* **I-36 (the path is visible, RULE 12):** wherever a root is shown, its full
  path is shown with it once known — the full-width row below the controls
  (`ui/FolderBar`, `sel-folder-path` / `v2-folder-path` / `svg-folder-path`) —
  and the row names the state the value is in (*the path*, *completed — check
  it*, *full path not captured*). A user never has to open a dialog to find out
  what a copy will hand over, and a capture in one tab reaches the others without
  a reload. The pill that showed the folder in place of the action, and the field
  that let the path be typed, are gone (§16, I-44/I-45).
* **I-37 (the boundary is stated, RULE 9):** the browser can never read the drive
  path of a picked folder, so the app states that boundary where the path would
  be: the row prints the folder's name with `full path not captured`, and the
  `Open folder` button's tooltip says that the path Explorer copied is captured
  with the pick. Nothing asks the user to type or paste a path any more (I-45).
* **I-38 (the scope is the batch's output, RULE 3/24):** when the picked tree
  contains a folder whose name matches `/^_.*split.+output/i` (or the picked
  folder is one), Selection V1/V2 and Generate SVG list **only** pairs with a
  side inside such a folder — the main folder keeps the unsplit sheets, which are
  the batch's input, and they are not reviewable and not generatable. The scope
  is a function of the tree's directories — and of what the picked folder itself
  is (I-47) — so a repeated scan decides the same way; every out-of-scope item is
  counted and reported (both toolbars, the log, `outside-split` exclusions),
  never silently dropped, and the records of out-of-scope pairs stay as orphans.
  A tree without such a folder behaves exactly as before.
* **I-39 (a "full path" is only a folder path, RULE 13):** the value remembered
  for a root (`iconSplitter.rootpaths.v1`) is either an Explorer-usable **folder**
  path — a drive path (`F:`, `F:\`, `F:\a\b`; forward slashes and surrounding
  quotes forgiven) or a UNC path (`\\server\share[\…]`) — or nothing at all.
  `isFolderPathText` is the only judge, and it runs on the raw text at every
  entry point (the clipboard adoption at pick time, and the one writer
  `saveRootPathInfo`) and again on read, so SVG markup, URLs, relative text and
  file names can never be stored, replayed, shown as the root's path or prefixed
  to a copy. A refusal stores nothing and leaves the previous memory in place.
* **I-41 (one file per pair, RULE 3/13):** a pair's metadata is a single JSON in
  the folder that holds the pair, named after the AI image's stem
  (`<stem>.svg.json`). It stores the pair's identity, both image faces, the
  pair's `decision` (may this AI image be generated from?), and one record per
  SVG version with `status`, `review` (is this SVG approved?), prompt,
  provider/model, timestamps, tokens, cost + basis + pricing version, validation
  and the redacted error. No global file holds any of it.
* **I-42 (the migration is read-only, RULE 13):** `<root>/review-decisions.json`
  is read as a fallback for pairs that have no local file and is never written or
  deleted by this build. A scan writes nothing. A legacy `<stem>.svg.json`
  (`v: 1`) keeps its versions, gets the pair identity derived from its stored AI
  face, and is upgraded on its next write. A local file always wins over the
  legacy record — including an explicit `pending`.
* **I-43 (a decision survives the tree, RULE 12/24):** because the record lives
  with the images, an approval travels with a renamed or moved folder; when the
  images are gone the file still reports the pair (`files-missing`); an
  unreadable pair file is named (banner + log + row status) and the in-memory
  decision is kept, never silently turned into `pending`; a failed write keeps
  the decision in memory and `Retry` rewrites exactly the pairs that failed.
* **I-44 (one folder control, RULE 10/12):** every tab that scans a folder
  offers exactly one way to open the picker — the green `Open folder` button
  (`ui/FolderBar.OpenFolderButton`, testids `sel-open-folder` / `v2-open-folder` /
  `svg-open-folder`), labelled with the action and never with the folder's name,
  present in every state, with real hover, active and keyboard-focus states. The
  loaded folder's complete path is shown in its own full-width **read-only row**
  below the controls (`sel-folder-path` / `v2-folder-path` / `svg-folder-path`):
  text, never an input, never a button.
* **I-45 (no hidden scanning, no hidden writes, RULE 13/24):** only the user's
  `Open folder` / `Rescan` (plus the boot restore) scans a folder, and only the
  pick-time capture writes the path memory. The 30 s Watcher and every
  copied-path control are gone from the UI *and* from the code (`SelState.watcher`,
  `useSelection.useWatcher`, `WATCH_MS`, `ui/RootPathField`, `ui/userootpath`,
  `lib/rootpath.saveRootPath`, `lib/clipboardpath.adoptCopiedPath`).
* **I-46 (the path row never lies, RULE 4):** the row shows the captured path
  word for word (whole value in its `title`, selectable like any text), or the
  folder's name with `full path not captured` when the browser withheld it; a
  path the app completed from a copied parent carries `completed — check it`.
  Copies are unaffected (I-28): they hand over a folder path, the real one when
  captured and the folder-name fallback otherwise.
* **I-47 (picking the output folder is picking the set, RULE 3/12):** when the
  picked folder **is** the app's own output folder (`_split_output`, tolerant
  variants) or one run folder inside it (`<YYYY-MM-DD_HH-mm-ss>`), every pair
  found below it is reviewable — the filter that hides the unsplit sheets
  applies only while the output folder is strictly *below* the picked root
  (`lib/splitscope.ScopeRule { split, hideOutside }`). The scope line names such
  a root (`Scope: split output only`) and never says "in the main folder", which
  is not inside the picked root at all.
* **I-56 (the folder of the file, RULE 4 — 2026-10-06):** a copy names the folder
  that CONTAINS the file the action was made from, at every depth: for
  `…/<stamp>/<piece>/split_04/<file>` that is `…\<piece>\split_04`, whoever's
  root was picked (`_split_output`, the month folder, the run folder or any
  ancestor). **Reverses I-48** (2026-10-05), whose "stop at the run folder" made
  a deep file's location point one level too high; the run folder is reached by
  copying an item that really sits in it. `svg/codeactions.openLocation` hands
  over `targetPathOf(row)` — the same path `svg-target-{id}` shows — so the row's
  text and the copied folder can never disagree (the older code joined the row's
  folder onto an already root-relative `svgPath`, doubling the chain).
  A folder that merely resembles the layout keeps the item's own folder, as
  before; `lib/batchlayout` owns the names both rules read.
* **I-52 (a capture is a conversation, RULE 4/12/13):** the pick is the primary
  capture; when it finds nothing the path is still recoverable without another
  dialog, and the UI says how. `Rescan` (and the Generate SVG rescan) makes one
  more attempt for a root whose path is unknown, and a `paste` anywhere outside
  a text field adopts the text for the root on screen
  (`ui/rootcapture.retryCapture` / `bindPasteCapture`, mounted by
  `ui/FolderBar.FolderPathRow`). Both take an **exact leaf match only** — a
  pasted parent, a word, a URL or markup writes nothing — and no read happens
  without the user's own gesture (`navigator.userActivation`), so a boot-time
  scan never touches the clipboard. The read reports a state, not just text
  (`lib/clipboardpath.ClipRead`: `text` / `empty` / `blocked` / `unsupported`),
  which is what lets the toast name the reason and the row name both ways out.
* **I-49 (a pair file is read from where it sits, RULE 3/13):** every read of a
  pair file rebases it onto the root doing the reading — `dirPath` is the file's
  own directory, each face's `relPath` is that directory plus the name the file
  stored, and the id is recomputed exactly as a scan of this root computes it
  (`lib/pairrebase.rebaseMeta`, applied by `selection/pairstore.loadMetaAt`). A
  decision therefore follows the folder between roots; a pair file that names an
  id no scan of this root would produce (a legacy record) still answers for that
  id when the legacy file is merged (`pairstore.loadPairDecisions` keeps the id
  each file carried).
* **I-50 (a run stamp anywhere in the set is evidence, RULE 3/12):** `scopeOf`
  reports `split: true` when the picked folder **is** an output folder *or* any
  name in the set (the root's own name, or any directory below it) is a run stamp
  — so `_split_output`, a month folder and one run folder all review the pieces
  they contain. `hideOutside` still applies only while `_split_output` lies
  strictly below the root (the `test_processing_2` case, I-38/I-40).
* **I-51 (the app names a folder only from a folder it already named, RULE 4/13):**
  the full path of a pick comes from the clipboard **only** when it matches the
  picked folder's name exactly; otherwise `ui/knownroots.deriveRootPath` answers
  it: the deepest folder this app already has a captured path for, plus the
  segments that folder's own `resolve(picked)` reports (`[]` when it is the same
  folder, `null` when it is not below). Every capture is remembered
  (`pickroot.pathForPick`), and each tab remembers the root it restores at boot
  (`selection/rootsource.boot`, `svg/scan.bootSources`) — so a pick inside a
  folder the app already knows is exact with an empty clipboard, while a
  clipboard guess that only *looks* right is overruled or left flagged
  `completed — check it`.
* **I-40 (the scope is visible, RULE 12):** both Selection toolbars state the
  scope the scan used and, when it hides pairs, how many are not listed
  ("Scope: split output only · N pair(s) in the main folder not listed" /
  "Scope: whole folder — no split output found"), and the Generate SVG list
  reports the same items as `outside-split` exclusions in its banner, audit and
  log. A user never has to guess why the list is shorter than the folder.
* **I-31 (SVG list, RULE 3/4):** a Generate SVG row is an **existing canonical
  AI output** whose path an approved decision names — never an invented `_AI`
  name, never a reference image, never a path that is not on disk. A source that
  fails this is excluded **with its reason** and reported (banner + audit + log);
  it is never silently dropped and never offered for generation. The judgement
  lives in one pure module (`svg/sourcelist.ts`), not inside the scan.
* **I-32 (identity, RULE 6/24):** one normalized AI path is one row, whatever
  the row index, the split folder or how many decision records name it; rows are
  ordered by normalized path, so a reload or a repeated rescan yields
  byte-identical rows, order and audit. N records naming one path are one row
  plus N−1 `duplicate` reports — the same file two split folders apart is two
  rows, because it is two files.
* **I-33 (audit, RULE 4):** every scan states the whole picture — files walked,
  AI sources on disk, references excluded, missing sources, duplicates removed
  and final unique rows — as one line in the source bar (`svg-audit`) and in the
  scan log (`svg.scan`, with the numbers as fields), so a list different from
  what the user expects can always be traced to a named reason. The exclusions
  and the audit are part of the snapshot key: a changed count is a changed scan.
* **I-34 (naming, RULE 3):** a source must be a **raster** image. This app's own
  output (`…_AI.svg`) and its versioned artifacts (`…_v1.svg`) are never sources
  and are never counted as AI sources in the audit — otherwise a second run
  would feed an artifact back into generation, and the counts would not add up.

## 6. Storage map

| Where | What | Rules |
|---|---|---|
| localStorage `iconSplitter.presets.v1` | preset list (JSON) | validated on read (RULE 13) |
| localStorage `iconSplitter.lastPreset.v1` | last-used preset name | restores on boot |
| IndexedDB `iconSplitter/handles` | source/dest directory handles per preset | permission re-requested on restore |
| `<refDir>/<base>.json` | per-reference source status records | rewritten after every scan/batch; app-owned, overwrite allowed |
| `<root>/_split_output/…` or custom dest | batch outputs | never overwritten (I-8) |
| `<root>/review-decisions.json` | **legacy** approve/decline records — read as a fallback only | never written or deleted by this build (I-42); a local pair file wins; corrupt → warn + keep memory (I-12) |
| IndexedDB `iconSplitter/handles["__selection__"]` | selection root handle (shared by both Selection tabs) | permission re-requested on restore |
| localStorage `iconSplitter.selectionV2.prefs.v1` | V2 view prefs `{ mode, thumbHeight }` | validated + clamped on read (RULE 13) |
| IndexedDB `iconSplitter/handles["__svg__"]` | Generate SVG root handle | falls back to the Selection handle |
| localStorage `iconSplitter.svg.prefs.v1` | SVG tab view prefs `{ thumbHeight, providerOpen, previewBg }` | clamped/validated on read (RULE 13); a missing/non-boolean `providerOpen` keeps the model card open |
| localStorage `iconSplitter.svg.prompt.v1` | generation prompt | empty/missing → documented default |
| localStorage `iconSplitter.svg.config.v1` | provider settings (base URL, model id, stall window, retries, concurrency, images/request, max tokens) | clamped on read (RULE 13) |
| localStorage `iconSplitter.svg.inflight.v1` | the in-flight journal: run/batch id, source ids + names, model, start time, provider request id — no key, no prompt, no answer | validated on read; corrupt = empty; cleared when a request gets a confirmed outcome |
| IndexedDB `iconSplitter/secrets` | Requesty API key | never in localStorage, presets, reports or Git (RULE 20); DB version 2 added this store — an install that predates it upgrades on first open, and a write that still fails falls back to a session-only key the UI names as such |
| localStorage `iconSplitter.rootpaths.v1` | the picked roots' real full paths, `{ [folderName]: path }` | normalised + validated on read (I-29); used only to build copy text; never leaves the browser |
| localStorage `iconSplitter.log.v1` | the global activity log: `{ v, max, minimized, entries }` | validated + re-sanitised on read; foreign version or corrupt JSON → the default state (I-25); cap 50–1000 governs display and storage; no key, header, data URL or payload may enter it (I-24) |
| `<dir>/<stem>.svg` | one generated SVG version | never overwritten; `_v2`, `_v3`… allocated from disk + the pair file |
| `<dir>/<stem>.svg.json` | **the pair's own file** (I-41): pair identity + both image faces + the pair's `decision` + one record per SVG version (status, review, prompt, provider/model, timestamps, tokens, cost + basis, validation, error, batch ref) | one file per pair, beside its images; atomic write; corrupt → named + decision kept (I-43); a legacy `v: 1` file keeps its versions and upgrades on the next write (I-42) |
| IndexedDB `iconSplitter/handles["__upload__"]` | SVG to upload root handle | falls back to the Generate SVG handle, then the Selection handle |
| localStorage `iconSplitter.upload.settings.v1` | upload settings `{ v, defaults, overrides }` (global defaults + per-icon overrides map) | validated/clamped on read (RULE 13): `background` is `transparent` or a hex (a missing or junk value → `transparent`; a stored white from before 2026-10-08 stays white), `strokeColor` is a hex or `artwork` (missing or junk → `#000000`, the 2026-10-08 default; a stored `artwork` stays `artwork`), `strokePx` is 0–32 px (the pre-2026-10-08 key `strokePt` is read as the same number and never written back; the fingerprint is positional, so nothing flips to stale); the undo path writes through the same store |
| localStorage `iconSplitter.upload.gemini.v1` | the Gemini provider config (endpoint, model, timeout, retries, concurrency) | clamped on read (RULE 13) |
| localStorage `iconSplitter.upload.prompt.v1` | the metadata prompt `{ v, prompt }` | validated on read: missing/empty/junk/foreign version → the documented default (`parsePromptText`, RULE 13); written on every edit, so a restart opens with the user's own text |
| localStorage `iconSplitter.upload.prompts.v1` | the saved prompt presets `{ v, presets: [{ name, text }] }` | validated entry by entry (names trimmed 1–60, text ≤ 8000), duplicates keep the last, capped at 50; corrupt → no presets |
| localStorage `iconSplitter.upload.prefs.v1` | upload view prefs `{ thumbHeight, providerOpen, previewBg }` | clamped/validated on read; display-only — the zoom never feeds the output scale |
| localStorage `iconSplitter.upload.journal.v1` | the in-flight metadata-request journal (row id, start time, request id — no key, no prompt, no answer) | validated on read; corrupt = empty; an open entry after a restart is `interrupted`, never resent |
| localStorage `iconSplitter.upload.meta.v1` | the **accepted-metadata cache** (CP-15), keyed by the sha256 of the SOURCE SVG: `{ v, cache: { [sha256]: { state: generated \| accepted, meta } } }` | validated entry-by-entry on read (junk dropped, foreign version = empty); bounded at 512 entries, oldest evicted first; an entry whose text no longer passes `upload-meta-v1` comes back `invalid`, never exportable: edited artwork misses the cache by construction |
| localStorage `iconSplitter.upload.jobs.v1` | the **per-icon job store** (CP-2): `{ v, states: { [pairId]: queued \| running \| processed \| partial \| failed \| cancelled \| interrupted } }` | validated on read (unknown states dropped), bounded at 1024; a `queued`/`running` entry left by a previous session becomes `interrupted` **once per page load**; the store never re-sends, retries or re-bills anything |
| IndexedDB `iconSplitter/secrets["gemini-api-key"]` | the Gemini API key | its own slot beside the Requesty key; never in localStorage, logs or exports (RULE 20); a refused write falls back to a session-only key the UI names as such |
| `<pair-folder>/export/<base>.svg|.jpg|.eps` | the export package (prepared SVG copy, 15.1 MP JPEG, optional genuine EPS). `<base>` keeps the icon's own name and drops ONLY the app's `_AI` marker (`lib/upload/export.ts` `stemOf`, the ONE rule the commit and the published-JPEG path share) — `fog_AI.svg` → `fog.svg`, `fog_AI_03.svg` → `fog_03.svg`, `icon-bunny-face_AI_7_04.svg` → `icon-bunny-face_7_04.svg`, `fog_AI_v2.svg` → `fog_v2.svg`; every numeric tail STAYS (the digits are what tell one icon from another — `fog_AI.svg` and `fog_AI_7.svg` are different pairs and stay `fog.*` and `fog_7.*`), and a name without a trailing `_AI` marker (or with a non-numeric tail, `fog_AI_x.svg`) comes back unchanged, never invented | written only by the validated export commit; the approved source and its sidecar are never touched. The approved version also stays in `export.json` (`source.version`) as before |
| `<pair-folder>/export/export.json` | the per-icon export record (schema v1: source/settings fingerprints, svgo + eps tool records, metadata block, outputs with hashes, stage, status, validation, timestamps) | one per icon, no global multi-icon file; written LAST as the commit marker; corrupt/missing → rebuilt, never destroys outputs |

Object URLs from user files are revoked on sheet removal (sheets mode).

## 7. Key modules and layers

| Layer | Files | Owns |
|---|---|---|
| Mode shell | `src/ui/Workbench.tsx`, `src/main.tsx` | Sheets/Batch tab switch |
| Sheets UI | `src/App.tsx`, `src/utils/cn.ts` | sheet state, controls, export paths |
| Detection | `src/lib/detect.ts` | `analyze` (mask), `detect` (boxes, auto radius, reading order) |
| Rendering | `src/lib/render.ts` | `squareInfo`, `cropRect`, `renderIcon`, `canvasToBlob` |
| Naming (batch) | `src/lib/naming.ts` | `_AI` parse, split names, variations, batch path |
| Scan (batch) | `src/lib/scan.ts` | tree walk, eligibility, ref linking, diff |
| State JSON | `src/lib/statefile.ts`, `src/batch/statewrite.ts` | model + merge + validation; file sync + outcomes |
| Output plan | `src/lib/output.ts` | month/timestamp layout, `_vNN` allocation |
| FS adapter | `src/lib/fs.ts`, `src/batch/picker.ts` | no-overwrite IO, tree read, folder picking |
| Batch split | `src/lib/batchsplit.ts`, `src/lib/dom.ts` | sheet→blobs orchestration; image loading |
| Batch UI | `src/batch/useBatch.ts`, `BatchPanel.tsx`, `ScanTable.tsx`, `PresetBar.tsx`, `store.ts` | orchestration, review window, presets, persistence |
| Selection logic | `src/lib/pairing.ts`, `reviewfilter.ts`, `reviewsort.ts`, `reviewmeta.ts`, `reviewfile.ts` |
| Path capture recovery | `src/ui/rootcapture.ts`, `src/lib/clipboardpath.ts` | the two recovery channels after a pick that missed the path (I-52): `Rescan`'s one exact-match retry and the user's own `Ctrl+V`; the read itself, which reports *why* it was empty (empty / blocked / unsupported) instead of one indistinguishable "none", and adopts nothing it cannot name |
| Pair files | `src/lib/pairmeta.ts`, `src/lib/pairrebase.ts`, `src/selection/pairstore.ts`, `src/selection/pairrecord.ts` | the stored shape (identity + faces + decision + SVG versions), parsing/serializing it, the transitions a decision or a version applies, the rebase that re-points a file read from another root (I-49), the read/write of one file beside the images (tmp → verify → overwrite, I-41/I-43), and the record ⇄ pair-file mapping legacy/undo paths use | pairing (order-independent, per-file problem reasons), filters, sorts, status/hotkey semantics, decision records |
| Scan sequencing | `src/lib/scanseq.ts` | the monotonically-increasing ticket: only the newest scan may commit |
| Selection logic (V2) | `src/lib/reviewselect.ts`, `reviewbulk.ts`, `reviewprefs.ts` | checkbox selection, bulk scope/summary, persisted view prefs |
| Selection IO+UI | `src/selection/state.ts`, `reviewstore.ts`, `handles.ts`, `fmt.ts`, `thumbs.ts`, `hotkeys.ts`, `copypath.ts`, `Surfaces.tsx`, `useSelection.ts`, `SelectionPanel.tsx`, `FilterBar.tsx`, `PairList.tsx`, `CompareView.tsx`, `HeaderRow.tsx`, `StatusFooter.tsx` | reducers, atomic decision IO, bulk reducer, shared hotkeys/surfaces, review UI |
| Selection V2 UI | `src/selectionv2/useSelectionV2.ts`, `SelectionV2Panel.tsx`, `SourceBar.tsx`, `FilterGrid.tsx`, `BulkBar.tsx`, `ZoomSlider.tsx`, `ReviewList.tsx`, `ReviewRow.tsx`, `ThumbPair.tsx`, `SegButton.tsx`, `prefsstore.ts` | view + selection state, list review, bulk bar, zoom, prefs IO |
| SVG pure rules | `src/lib/svgconfig.ts`, `svgprompt.ts`, `svgbatch.ts`, `svgcomposite.ts`, `svgcanvas.ts`, `svgextract.ts`, `svgvalidate.ts`, `svgpreview.ts`, `svgicons.ts`, `svgfile.ts`, `svglist.ts`, `svgrequest.ts`, `svgstream.ts`, `svgstreamread.ts`, `svgusage.ts`, `svgpricing.ts`, `svgbackground.ts`, `svgsecret.ts`, `svgclock.ts`, `modelcaps.ts`, `effortlimits.ts` | provider settings, prompt + manifest, batch plan, grid layout, canvas composite, response split/match, validation/security, preview pipeline (parse → sanitize → fit → inline markup), icon count, sidecar model + versioning + cost basis, list filters/sort/totals (reported vs estimated cost kept apart), request building + HTTP/transport/error classification, the pure SSE frame parser, the streaming reader (stall watchdog, cancel, request-id capture), token/cost formatting, the pricing table + the one cost decision, preview-background presets/validation/contrast rule, secret masking, elapsed-time formatting, per-model capability rules (temperature / token field / effort tiers) + value sanitising, the reasoning-tier **stall-window floor** + its wording (no icon cap) |
| The batch's output layout | `src/lib/batchlayout.ts` | the names of the app's own output tree — `_split_output` (tolerant variants), `<YYYY-MM>`, `<YYYY-MM-DD_HH-mm-ss>` — read by `lib/splitscope` (which set is reviewable, I-38/I-47) and `lib/rootpath` (where a copy stops, I-28/I-48) |
| The picked root's path | `src/ui/pickroot.ts`, `src/ui/knownroots.ts`, `src/lib/clipboardpath.ts`, `src/lib/rootpath.ts`, `src/ui/FolderBar.tsx` | one pick entry point for all three tabs (I-35), the guarded clipboard read + match, the string rules and the one storage key (`iconSplitter.rootpaths.v1`, `{ path, how }`), the folders the app already named and the derivation from one of them (`resolve()` segments, I-51), the live React view of it, and the one folder control (green button + read-only path row, I-44/I-46) |
| SVG list rules | `src/svg/sourcelist.ts` | which approved sources the Generate SVG tab may list (I-31…I-34): canonical `_AI` + raster, approval by pair id or by path, one row per normalized AI path, the exclusions with their reasons, the audit counts and its one-line text. Pure — no IO, no React |
| SVG IO + state | `src/svg/sources.ts`, `scankey.ts`, `sidecar.ts`, `keystore.ts`, `promptstore.ts`, `prefsstore.ts`, `composite.ts`, `saveversion.ts`, `runner.ts`, `runtypes.ts`, `runbatch.ts`, `scan.ts`, `rowmodel.ts`, `runstate.ts`, `reviewact.ts`, `sourceindex.ts`, `reviewundo.ts`, `statemodel.ts`, `ctx.ts`, `actions.ts`, `codeactions.ts`, `useSvgGen.ts`, `paramstore.ts`, `catalog.ts`, `modelparams.ts`, `keyactions.ts` | approved-source discovery (every approved AI output listed once, with per-file problems, and everything excluded reported), the snapshot key an unchanged scan compares, sidecar IO, key store, the generation run (one module for the run, one for a single request, one for their shared vocabulary), row/event/review reducers, the undo bridge, per-model settings store (localStorage), the 24 h model-list cache + `GET /v1/models` fetch, the one resolve rule they all share, and the API-key actions |
| SVG UI | `src/svg/SvgPanel.tsx`, `SvgControls.tsx`, `SvgBulkBar.tsx`, `SvgList.tsx`, `SvgRow.tsx`, `SvgThumbs.tsx`, `SvgPreview.tsx`, `SvgBatchStrip.tsx`, `SvgConfirm.tsx`, `SvgDialogs.tsx`, `SvgHotkeys.ts`, `SvgSampling.tsx` | the tab shell, controls, bulk bar, list, rows, previews (AI thumb + inline SVG frame in the user's background), batch strip, the paginated confirmation, dialogs, hotkeys, the three sampling controls |
| The API key on this device | `src/lib/keyvault.ts`, `src/lib/idbvault.ts`, `src/ui/KeySlot.tsx`, `src/batch/store.ts`, `src/svg/keystore.ts`, `src/upload/keystore.ts` | ONE key vault both tabs wrap: `read()` answers where the key came from (`device` / `session` / `unreadable` / `none`) instead of a bare null, `save("")` reports `empty` and touches nothing, and a write the browser refused keeps a session copy; the one adapter wiring that vault to IndexedDB, the ONE widget both provider cards render (state button + `Forget` + editor whose Save is disabled while empty); the page's single IndexedDB connection (`handles` + `secrets`, v2) |
| Upload pure rules | `src/lib/upload/settings.ts`, `src/lib/upload/artboard.ts`, `src/lib/upload/geom.ts`, `src/lib/upload/geom/matrix.ts`, `src/lib/upload/geom/seg.ts`, `src/lib/upload/geom/arc.ts`, `src/lib/upload/geom/path.ts`, `src/lib/upload/geom/bounds.ts`, `src/lib/upload/geom/stroke.ts`, `src/lib/upload/geom/outline.ts`, `src/lib/upload/geom/ops.ts`, `src/lib/upload/geom/shapes.ts`, `src/lib/upload/geom/bakeshape.ts`, `src/lib/upload/bake.ts`, `src/lib/upload/strokeglobal.ts`, `hash.ts`, `src/lib/upload/prepare.ts`, `src/lib/upload/meta.ts`, `src/lib/upload/gemini.ts`, `src/lib/upload/embed.ts`, `src/lib/upload/jpeg.ts`, `src/lib/upload/optimize.ts`, `src/lib/upload/epspath.ts`, `src/lib/upload/eps.ts`, `src/lib/upload/raster.ts`, `src/lib/upload/export.ts`, `src/lib/upload/svgdom.ts`, `src/lib/upload/clean.ts`, `src/lib/upload/cleandom.ts` | settings domain (defaults/overrides/effective/fingerprint, the two paints — `readPaint(value, sentinel)`, `isTransparent`, `flattenColor` — with their clamps; `artboard.ts` = the artboard's content/preset/custom modes with their clamps and presets), 96 DPI source-length reading + padded fit + pinned-artboard fit (scale, letterboxed offsets, exact pinned px) + integer 15.1 MP targets, the matrix/segment/arc/path primitives, visible bounds incl. strokes/caps/joins/CTM (unsupported named, never guessed), stroke inheritance, the geometry bake (`bake.ts`: every transform into the coordinates, named refusals; `geom/outline.ts`: the ONE outline model — shapes + full path grammar as absolute move/line/cubic/close ops, affine transform, SVG `d` writer; `geom/bakeshape.ts`: which element survives which matrix), sha256, export-SVG preparation (export copy only: bake, viewBox-only root, optional background rect, stroke width written verbatim + colour restyle, then `strokeglobal.ts`: each stroke property defined once — on the root when the shapes agree, on the stroked shape otherwise, never on a container), the exact metadata prompt + deterministic parse/validate + fingerprint, the verified Gemini client (endpoint/model/auth header/request builder/readers/classification), SVG `<title>/<desc>` + keyword embed/readback, XMP APP1 JPEG embed/readback + SOF reader + verifyJpeg, the SVGO wrapper (recorded version/config/hashes), the EPS PostScript path writer over the outline model + genuine subset writer + verifier, direct vector rasterization with background flatten + decode-back verification, the export record schema v1 + stage planner, the DOM helpers the clean policy shares (`svgdom.ts`: element/attribute/reference readers), and the clean export policy itself — `clean.ts` = the rules as one violation list (`verifyExportSvg`), `cleandom.ts` = the rebuilding pass that satisfies them (fold paint-only stylesheets, drop naming and foreign vocabulary, keep a referenced id under a minimal generated name, SVG 1.1 root) |
| Upload feature | `src/upload/discovery.ts`, `scan.ts`, `journal.ts`, `settingsstore.ts`, `configstore.ts`, `prefsstore.ts`, `keystore.ts`, `rowmodel.ts`, `statemodel.ts`, `uploadundo.ts`, `actions.ts`, `uiactions.ts`, `metaactions.ts`, `exportactions.ts`, `useUpload.ts`, `runmetadata.ts`, `runexport.ts`, `exportstages.ts`, `exportvalidate.ts`, `exportcommit.ts`, `types.ts` | approved-SVG discovery (export/ excluded), scan orchestration, the in-flight journal, the four stores, row assembly (record + source hash → row, exact staleness), the model + reducer, the undo bridge, the action surface, both pipelines (metadata + export) and the atomic commit |
| Upload UI | `src/upload/UploadPanel.tsx`, `UploadControls.tsx`, `UploadBulkBar.tsx`, `UploadList.tsx`, `UploadRow.tsx`, `UploadMetaFields.tsx`, `UploadSettingsDialog.tsx`, `UploadPaintSettings.tsx`, `settingsfield.tsx`, `UploadPreview.tsx` | the tab shell (reusing the Generate SVG look), controls + provider card, bulk bar, list, rows, the editable/copiable metadata fields, the settings dialog (number/toggle/artboard rows + the shell; `settingsfield.tsx` = the props, the inherited/overridden marker and the ONE write path every row shares; `UploadPaintSettings.tsx` = the background and stroke-colour pickers: a "none of ours" swatch — transparent / artwork — plus the shared presets and a custom colour; the stroke colour's default is the black preset), the framed SVG preview |

Direction: UI → batch/selection → lib, never upwards (RULE 1, RULE 3).

## 8. Tests — what exists and what must exist (RULE 8)

Exists (`tests/`, 126 files / 1334 tests; canvas shims serve synthetic pixels,
in-memory fakes implement the FS handle interfaces, happy-dom mounts the
Selection, Selection V2, Generate SVG and SVG to upload panels and drives them
with hotkeys and `data-testid` handles):

* `detect.test.ts` — box count, margins, radius merge/split, dust filter, reading order
* `analyze.test.ts` — background/threshold/mask/ink, transparency-as-white, downscale, analyze→detect end-to-end
* `render.test.ts` — squareInfo/cropRect geometry
* `render_icon.test.ts` — sizing/clamps, bg fill + neighbour wipe + restore, transparent pass, blob gate
* `naming.test.ts` — `_AI` parse, reference derivation, split/variation names, batch path
* `scan.test.ts` — recursive walk + ignore, eligibility, ref linking, scan diff
* `statefile.test.ts` — merge semantics, statuses, corrupt-payload rejection
* `presets.test.ts` — defaults, validation clamps, list round-trip, apply
* `output_plan.test.ts` — layout, `_vNN` collisions, existing-folder respect
* `fs.test.ts` — tree read, no-overwrite write, nested dirs, copy (fakes)
* `batchsplit.test.ts` — one blob per icon, honest empty sheet
* `process.test.ts` — full output tree, deleted/failed isolation, stop, ref copy
* `statewrite.test.ts` — per-reference JSON write, missing retention, corrupt replace
* `store.test.ts` — preset persistence, corrupt rejection, last-used name
* `pairing.test.ts` — nested pairing, variants, duplicates, unpaired sides, ids
* `reviewfilter.test.ts` — month/custom ranges (inclusive, either anchor), status+search
* `reviewsort.test.ts` — all sort modes × directions, status meta, hotkeys
* `reviewfile.test.ts` — corrupt/valid parse, orphans, rename carry, diff
* `reviewstore.test.ts` — missing/corrupt load, atomic write + failure path
* `selection_state.test.ts` — applyScan/withDecision/nextPending/counters
* `scanseq` + `scankey` (in `svg_scan.test.ts`) — the ticket order and the
  snapshot key: a superseded scan commits nothing, an identical one commits
  nothing, a changed one commits exactly once
* `selection_scan.test.ts` — the Selection `rescan` end to end: identical
  rescan keeps `pairs`/`records` by reference, a rename carries the decision
  once, and an overlapping older rescan commits nothing
* `handles.test.ts`, `fmt.test.ts` — path resolution, formatters
* `selection_ui.test.tsx` — DOM smoke: pick → list → A/D hotkeys → text chips
* `reviewselect.test.ts`, `reviewbulk.test.ts`, `reviewprefs.test.ts`,
  `selection_bulk.test.ts`, `hotkeys.test.ts`, `copypath.test.ts` — V2 rules:
  selection incl. indeterminate, bulk scope + one summary line, zoom clamp /
  no-upscale / corrupt prefs, bulk reducer, shared hotkeys, path fallback
* `selectionv2_ui.test.tsx` — DOM: recursive scan + both thumbnails, layout
  switch, active row + A/D + auto-next, zoom bounds/value/persistence,
  selection across filter + sort, approve selected/visible, incomplete pairs
  out of scope, save failure + retry, empty/no-match, corrupt JSON, rescan,
  restart persistence, a11y labels
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
* **I-54 — the preferred version.** A pair file may carry `"preferred": n`
  beside its `versions[]` (`v` stays 2: the key is additive, and a reader that
  predates it simply ignores it). It names the version the row SHOWS — preview,
  Copy, Code, Approve/Decline, the list fields and the scan key all read it
  through `chosenVersion(versions, preferred)`; nothing is ever deleted, so
  every version stays re-choosable, and a nonsense or dangling number falls back
  to "nobody chose" (the newest valid version). It is written through
  `saveMetaAt` (tmp → verify → overwrite), off the undo timeline, and the
  version chooser refuses honestly when it cannot be written.
* **I-53 — the generation queue (rewritten 2026-10-08).** Confirming a batch
  while a run is in flight APPENDS it; the run in flight is never interrupted
  and the button is never disabled by it. `refs.queue` is the synchronous
  authority and `refs.abort` (non-null) is what "a request is in flight" means,
  so a stale closure can never start two runs or lose a batch. The queue is
  session-only — nothing queued is ever sent after a restart — and Cancel stops
  the run AND drops the whole queue, saying how many batches that was. A
  waiting batch changes nothing about the files until its request really
  starts; the row only SAYS it is next: `SvgRow.queued` is derived from the
  queue every render (`withQueued`), never stored, so the badge reads a grey
  "Next attempt" (`.svg-badge.queued`) while the source waits and the row's own
  status is back the moment the batch is dropped — nothing to restore. A row's
  own Regenerate/Generate while a run is in flight is the NEXT attempt
  (`placement: "front"` → `regenerateNext` → `enqueueFront`): no dialog (the
  queue line and the badge are visible before it starts), first in the queue,
  and the same image leaves every later waiting batch (`dropIdFrom`, batches
  re-planned and re-labelled, an emptied batch goes) so one queue never
  generates it twice; the toast says "… — next attempt, first in the queue (N
  queued) · removed from N waiting batch(es)". Bulk Generate, `G` and the
  recovery retry still confirm and append. Every run event carries the run's
  image total (`run-start.images`, `batch-start.images`, `batch-done.done /
  .images`) and a run id (`batch-start.runId` — batch ids repeat per run), so
  the log's request-done line reads "· d of m image(s) done".
  Design: `docs/archive/2026-10-08-svg-queue-keepalive/design.md`.
* **I-57 — the run outlives the tab (2026-10-08).** The Workbench mounts
  `SvgPanel` once and parks it `hidden` on every other tab
  (`data-testid="svg-shell"`, the same node across switches); the panel takes
  `active` and, on every RETURN to the tab, dispatches `repin` and rescans when
  nothing runs — never on the first mount, which scans anyway. The run's
  numbers follow the user: `SvgRunPopup` is portalled to `<body>` (a hidden
  ancestor would hide a fixed child) and says
  `totalsLine(withChain(runTotals(progress, queue), chain), running)` —
  "Generating · 7 done · 13 left · 1 failed · request 2 of 5" / "Done · 20 done
  · 0 left". One chain of runs is ONE count: a queued batch starts as its own
  run, so `drainQueue` resets `model.chain` with the first run of a chain and
  folds each finished run's outcomes in (`chainAdd`) when the next one starts —
  the run on screen is never counted twice. The final line stays until the ×
  dismisses it (keyed by `runId`); a new run brings the popup back. `runtotals.ts`
  is the one arithmetic behind the popup, the bulk bar and the log.
* **I-58 — the list never moves under the user (2026-10-08).** The visible
  order is PINNED: `model.order` (`pinOrder(previous, sortedIds(rows, sort))`)
  is refreshed only by a scan (`rows`), a sort change and `repin` (tab
  activation) — never by a run event (`rows-fn`) or a filter (the pin spans all
  rows, a filter only hides). A landing SVG updates its row in place; the date
  sort is applied once, deliberately, when the user comes back. Everything that
  appears or grows during a run — the batch strip and the queue, together the
  `RunRecord` (`svg-run-record`) — sits BELOW the list, so nothing inserted
  above it can push the "APPROVED SOURCES / SVG OUTPUT" header away.
* `keyvault.test.ts` — the key rules on their own: a save that storage refused
  is reported `session` (and the key still loads), `save("")` is `empty` and
  erases nothing, an unreadable store answers `unreadable` — never `none` — and
  a corrupt envelope is absent, not a crash
* `upload_keypersist.test.tsx` — the reported bug, end to end: a key saved once
  survives an edit, a tab switch and a fresh boot; a session-only key says so
  instead of asking again; an empty Save cannot destroy a stored key (Save is
  disabled; `Forget` is what clears); five operations open ONE connection
* `upload_settings_store.test.ts`, `upload_keystore.test.ts`,
  `upload_journal.test.ts` — the stores (defaults + overrides round-trip,
  corrupt → defaults, clamps), the Gemini key's secret hygiene (own IndexedDB
  slot, never localStorage, session fallback) and the in-flight journal
  (restart → interrupted, corrupt → empty)
* `upload_rowmodel.test.ts` — row assembly from a real export.json + source
  hash, exact staleness (source/settings/metadata fingerprints), the metadata
  state a record carries, filters/sort/header/counts (incl. a failed run with
  record null counted), pruneChecked
* `upload_undo.test.ts` — the `uploadSettings` entry: payload gate, the live
  binding, the persist-only path, no-op refusal, undo/redo routing
* `upload_ui.test.tsx` — DOM end-to-end: approved rows only (pending/orphan
  reported), previews + zoom, filters/search, selection, the settings dialog
  (defaults persisted not undoable; per-icon markers; bulk apply = ONE undo
  entry; reset), the exact-request confirmation, editable/copiable metadata
  fields, invalid-answer refusal, cancel (never resent), interrupted after a
  restart, export → green committed package with the source untouched, stale →
  re-export, metadata embedded + verified, honest failure commits nothing
* `svg_ui.test.tsx` — DOM: approved rows only, newest SVG beside its source,
  bulk header checkbox + disabled bulk actions, filters, the code dialog and
  its Escape close, the confirm-before-send guard, approve + undo, and the
  preview frame: inline `<svg>` with `xmlns` + `100%` + `xMidYMid meet`, the
  frame's `data-version` equal to the version Copy hands over, "Preview
  failed" + reason for a malformed file, "No SVG" for a source with none, the
  one zoom slider resizing BOTH preview boxes in step at EVERY value 48…800,
  every preview background applied to the frame while the document stays
  byte-identical, and the model card + request estimate following all four
  tiers
* `log_lib.test.ts` — the log's pure core: the entry shape, key/data-URL
  redaction on write, the cap clamp (0/12→50, 250→200, 600→500, 99999→1000),
  the ring buffer, `formatEntry`/`formatLogText` and a damaged or foreign stored
  payload (valid entries kept, re-sanitised on read)
* `log_scroll.test.ts` — the follow rule: at the bottom, inside the 24 px slack,
  and short content is "at the bottom" too
* `log_store.test.ts` — subscribe/notify, the 150 ms debounce, the cap trimming
  display **and** storage, a restart restoring the log, `clearLog()` leaving one
  `log.cleared` entry, the remembered minimize state, corrupt → defaults
* `log_layout.test.tsx` — **the port's bug gate**: the dock is the shell's last
  row and a sibling *after* `app-main`, never `fixed`/`sticky`/`absolute`; the
  shell is a viewport column; `.v2`/`.svg` are floored at the band they are
  given (never `100vh`, never a fixed height that could collapse the list); the
  fixed toasts read `--app-dock-h`, which the dock publishes and moves with
  minimize/restore
* `log_ui.test.tsx` — DOM: one dock on every tab with its head/body/empty state,
  the tab switches recorded once each, level + feature + action on a row, a key
  written into an entry never shown, follow/pause/resume on the real scroll
  events, Copy all == `formatLogText(entries)`, Clear, the cap (120 → 50 keeps
  `step-71 … log.max-entries`), and minimize surviving a restart
* `log_wiring.test.tsx` — the real emitters: a pushed edit (`{feature:"history",
  action:"push"}` with its label and count), undo + the failed apply, a scan's
  summary and its `review-decisions.json` warning, `key-saved` with the mask and
  never the key, and `withRunLog` handing the event to the live UI before it
  writes the entry
* `svg_runlog.test.ts` — every `RunEvent` kind maps to one `svg.*` entry with
  its stable ids (run, request, item, retry, cancel), a finished request reports
  tokens/cost/outcome/elapsed **and** the provider request id, a stalled outcome
  is a warning that says "never retried" (never an error), and the composite's
  data URL travelling on the same event never reaches the entry
* `secret_hygiene.test.ts` (extended) — a key written through the real log store
  appears neither in the entry, the stored payload, nor the copied text
* `verify_runner.test.ts` — the lane plan of `tools/verify.mjs`, spawned for
  real: fast mode runs the suite exactly once (the coverage lane), `--full`
  adds the standalone lane, lane order, quality-lane args, `--base` passthrough
* `quality_base.test.ts` — `tools/quality.mjs --base/--files`, spawned for
  real: explicit ref/list, loud failure on an unknown ref or a missing file,
  honest empty set for non-src, the shallow-clone fetch hint

Must exist before the matching change ships:

* any new exported lib/batch function → a test that fails if it is deleted
* sheet/batch UI flows → component tests using `UI_SELECTORS.md` handles when first needed
* ZIP/folder export → assertion on names + count (I-6/I-8), not just "no throw"

## 9. Quality gates summary (RULE 16 — thresholds frozen)

| Gate | Fail line | Tool |
|---|---:|---|
| Function LOC | > 30 | `tools/quality.mjs` |
| Params | > 4 | same |
| Cyclomatic complexity | > 10 | same + eslint warn |
| Nesting | > 4 | same + eslint warn |
| File lines | > 300 (warn), ratchet growth fails | same |
| Coverage `src/lib` | lines ≥ 80%, never decrease | vitest v8 |
| Anti-gaming | `partN` helpers always fail | same |

Workflow and ratchet: `CODE_VERIFICATION.md`. Dated re-checks: `QUALITY_RECHECK.md`.

## 10. History of designs — pointers

* 2026-09-30 — rules adopted from `marnikus/Process-Images-in-Areana`
  `docs/current/*` (AGENT_RULES 24 rules, CODE_VERIFICATION, DOM_SELECTORS →
  UI_SELECTORS, QUALITY_RECHECK); metrics reports intentionally not ported.
* 2026-10-01 — batch processing designed TDD-first:
  `docs/archive/2026-10-01-batch-processing/design.md` (module map, browser
  constraints, rule budget, negative tests).
* 2026-10-01 — Selection review designed TDD-first:
  `docs/archive/2026-10-01-selection-review/design.md` (pairing model, atomic
  decision protocol, rename carry, hotkeys, a11y).
* 2026-10-01 — Selection review V2 designed TDD-first from the prepared HTML
  template: `docs/archive/2026-10-01-selection-v2/design.md` (layering, list
  review rows, zoom slider, selection vs decision state, bulk scope, a11y
  deviation from the template's `role="listbox"`).
* 2026-10-01 — Generate SVG designed TDD-first from the SVG-generation prompt:
  `docs/archive/2026-10-01-generate-svg/design.md` (approved-only discovery,
  contact-sheet batching, name+title matching, validate-before-write,
  per-source sidecar versioning, token/cost honesty, RULE 20 key handling).
* 2026-10-01 — preview background + task cost designed TDD-first:
  `docs/archive/2026-10-01-svg-preview-cost/design.md` (preview-only frame and
  the contrast rule, one cost decision with a versioned rate card, cost basis +
  pricing version in the sidecar).
* 2026-10-01 — multi-request confirmation, reasoning limits, tier waits and the
  preview/zoom fixes designed TDD-first:
  `docs/archive/2026-10-01-svg-batches-limits-preview/design.md` (splitter +
  validator, the paginated confirmation, per-request outcomes, one zoom value,
  the preview's layout-only stylesheet). Its effort **icon caps and total
  timeout were reversed on 2026-10-05** — see the entry below.
* 2026-10-05 — one JSON per image pair (the pair's approval **and** its SVG
  history, no global metadata): `docs/archive/2026-10-05-per-pair-metadata/design.md`
  (contract, naming, the read-only legacy fallback, module plan, TDD order,
  verification, rejected alternatives, I-41…I-43).
* 2026-10-05 — long SVG generations must survive, not be truncated:
  `docs/archive/2026-10-05-svg-long-requests/design.md` (the user's batch size
  at every tier, SSE streaming + `stream_options.include_usage`, the stall
  window replacing every total timeout, four distinct outcomes with a stall
  reported as *outcome unknown*, kept request ids, the in-flight journal and
  its explicit restart recovery, ticking elapsed + Cancel).
* 2026-10-07 — SVG to upload built TDD-first from the prepared template:
  `docs/archive/2026-10-07-svg-to-upload/design.md` (discovery through the
  pair sidecars, settings and undo, the Gemini metadata prompt and transport,
  SVGO/JPEG/EPS pipelines, the per-icon `export.json` and its atomic commit,
  no automatic uploading).
* 2026-10-07 — environment-setup performance (agent sandboxes):
  `docs/archive/2026-10-07-env-setup-performance/design.md` (shallow-clone-safe
  quality gate `--base/--files`, pinned toolchain, root `AGENTS.md`, the node
  verify runner replacing `pre_push_check.sh`, devcontainer + CI, doc-map
  hygiene; the O4 doc split is deferred there with reasons).

## 11. Current UI — control inventory

Full handle reference with semantic fallbacks: `UI_SELECTORS.md`.

* App shell: `app-shell` (one viewport column: nav → `app-main` → `log-dock`),
  `app-main` (the region that scrolls — the window never does). The global
  activity log dock is the last row of that column on **every** tab: `log-dock`,
  `log-head`, `log-count`, `log-autoscroll`, `log-max`, `log-copy`, `log-clear`,
  `log-minimize`, `log-note`, `log-body`, `log-list`, `log-entry`, `log-empty`.

* Workbench: `tab-sheets`, `tab-batch`, `tab-selection`, `tab-selection-v2`,
  `tab-generate-svg`.
* Sheets mode: header (upload + 3 export buttons), Sheets, Export settings
  (padding/size/transparent), Detection (merge slider + reset), Boundary
  overlay, Result grid, busy overlay, toast.
* Batch mode: header controls (`batch-root`, `batch-refresh`, `batch-process`,
  `batch-cancel`), PresetBar (name/save/list/delete + split settings), Dest
  info, review window (`scan-table`, `select-all`, per-row checkbox/actions),
  reference warnings, busy overlay, toast.
* Selection mode: header (`sel-root`, `sel-rescan`, `sel-watcher`, counters,
  help), FilterBar (date modes + From/To, status, sort, order, clear), review
  list (`sel-list`, `sel-search`, `sel-row-*`), comparison (`sel-compare`,
  Approve/Decline, 1:1/SYNC, per-side Open-in-Explorer), status footer
  (`sel-footer`), write/corrupt banners, busy + toast.
* Selection V2 mode: source bar (`v2-root`, `v2-rescan`, `v2-watcher`,
  `v2-mode-list` / `v2-mode-compare`, `v2-count-*`), filter grid (`v2-date-*`,
  `v2-from` / `v2-to`, `v2-status`, `v2-pairing`, `v2-sort`, `v2-dir`,
  `v2-shown`, `v2-clear`), bulk bar (`v2-check-all`, `v2-selected-count`,
  `v2-scope`, `v2-blocked`, `v2-hidden`, `v2-select-visible`, `v2-deselect`,
  `v2-thumb` + `v2-thumb-value`, `v2-approve-selected`, `v2-approve-visible`),
  list (`v2-list`, `v2-rows`, `v2-row-*`, `v2-check-*`, `v2-thumb-src` /
  `v2-thumb-ai`, `v2-status-*`, `v2-open-{src,ai}-*`, `v2-decline-*` /
  `v2-approve-row-*`, `v2-autonext`, `v2-empty`, `v2-nomatch`), comparison
  (`v2-pair-picker` + the V1 `sel-compare` handles), shared surfaces
  (`v2-writewarn` / `v2-retry`, `v2-corrupt`, `v2-toast`, `v2-busy` and the
  shared `sel-footer` / `sel-diff` / `sel-retry-count`), the folder control
  (`v2-open-folder` + the read-only `v2-folder-path` row, I-44/I-46), and the
  copy prefix that row supplies. Full table: `UI_SELECTORS.md` §N.
* Generate SVG mode: the row's scan status (`svg-problem-{id}` — "AI image
  missing" / "Reference missing" / "Unreadable file" / "Files missing", with
  the full reason in the `title`), source bar (`svg-open-folder`,
  `svg-folder-path`, `svg-rescan`, `svg-count-*`), prompt + provider card
  (`svg-prompt`, `svg-reset-prompt`,
  `svg-provider`, `svg-limits`, `svg-per-request`, `svg-timeout`,
  `svg-retries`, `svg-model`, `svg-key-state`
  / `svg-key-input` / `svg-key-save`), the copy prefix (`svg-root-path`;
  `svg-choose-root` is offered while a root is loaded too, so this tab can be
  pointed by hand), filters (`svg-filter-generation`,
  `svg-filter-review`, `svg-sort`, `svg-search`, `svg-shown`,
  `svg-clear-filters`), bulk bar (`svg-check-all`, `svg-selected-count`,
  `svg-select-visible`, `svg-deselect`, `svg-thumb` + `svg-thumb-value`,
  preview background (`svg-bg`, `svg-bg-{white,black,gray,green,red}`,
  `svg-bg-custom`, `svg-bg-value`), `svg-estimate`,
  `svg-generate-selected`, `svg-approve-selected`,
  `svg-decline-selected`, `svg-cancel-run`), list (`svg-list`, `svg-rows`,
  `svg-row-*`, `svg-check-*`, `svg-ai-*` / `svg-prev-*`,
  `svg-prev-frame-*` (the coloured frame), `svg-target-*` (the SVG the row
  owns, or the path generation will write) `svg-status-*`,
  `svg-review-*`, `svg-usage-*`, `svg-persist-*`, `svg-generate-*`,
  `svg-approve-*`, `svg-decline-*`, `svg-location-*`, `svg-copy-*`,
  `svg-code-*`, `svg-history-*` + `svg-history-cost-{n}`, `svg-empty`),
  batch strip (`svg-batch`, `svg-batch-composite`, `svg-batch-id`,
  `svg-batch-grid`, `svg-batch-counts`, `svg-batch-elapsed` (ticking
  `elapsed m:ss` while a request is in flight; the bulk bar's
  `svg-batch-progress` line carries the same clock as `svg-bulk-elapsed`), `svg-batch-reports` +
  `svg-batch-report-{n}` (with `outcome unknown` and its own elapsed time),
  `svg-batch-cancel`), confirmation
  (`svg-confirm`,
  `svg-confirm-{count,requests,model,sampling,timeout,streaming}`,
  `svg-confirm-{close,cancel,generate}`, `svg-confirm-limit`,
  `svg-confirm-problem`, one page per request: `svg-batch-page`,
  `svg-batch-prev` / `svg-batch-next`, `svg-batch-grid`, `svg-batch-empty`,
  `svg-batch-items`, `svg-composite-img` / `svg-composite-meta` /
  `svg-composite-building` / `svg-composite-error`), dialogs
  (`svg-code-dialog`, `svg-history-dialog`), banners (`svg-warn-*` and the
  in-flight recovery note `svg-inflight` with `svg-inflight-note`,
  `svg-inflight-retry`, `svg-inflight-dismiss`), status bar
  (`svg-statusbar`), toast + busy (`svg-toast`, `svg-busy`); review undo goes
  through the shared `hist-*` handles. Full table: `UI_SELECTORS.md` §P.
* SVG to upload mode: source bar (`upload-open-folder`, `upload-folder-path`,
  `upload-rescan`, `upload-scope-copy`, `upload-audit`,
  `upload-count-{icons,processed,partial,failed,stale}`), settings button +
  provider card (`upload-settings-open`, `upload-provider-card`,
  `upload-provider`, `upload-limits`, `upload-model`, `upload-endpoint`,
  `upload-timeout`, `upload-retries`, `upload-concurrency`, `upload-prompt`
  (read-only — the exact prompt), `upload-key-state` / `upload-key-mask` /
  `upload-key-note` / `upload-key-input` / `upload-key-save`), filters
  (`upload-filter-status`, `upload-filter-metadata`, `upload-sort`,
  `upload-search`, `upload-shown`, `upload-clear-filters`), bulk bar
  (`upload-check-all`, `upload-selected-count`, `upload-scope`,
  `upload-select-visible`, `upload-deselect`, `upload-thumb` +
  `upload-thumb-value`, preview background (`upload-bg`,
  `upload-bg-{white,black,gray,green,red}`, `upload-bg-custom`,
  `upload-bg-value`), `upload-estimate` / `upload-progress`,
  `upload-apply-settings`, `upload-meta-selected`,
  `upload-export-selected`, `upload-cancel-run`), list (`upload-list`,
  `upload-rows`, `upload-row-*`, `upload-check-*`, `upload-prev-*` +
  `upload-prev-*-frame`, `upload-target-*`, `upload-export-path-*`,
  `upload-status-*`, `upload-meta-cell-*`, `upload-settings-*` +
  `upload-settings-pinned-*`, `upload-meta-*` / `upload-settings-btn-*` /
  `upload-export-*`, the active row's detail `upload-detail-*` with the
  editable/copiable fields `upload-meta-{title,description,tags}-*` +
  `upload-copy-{title,description,tags}-*` + `upload-meta-{state,usage,detail,
  validation,accept,regen,gen}-*`), the settings dialog (`upload-dialog-*`,
  `upload-set-{padding,stroke,mp,quality,optimize,eps}`,
  `upload-set-bg-{transparent,white,black,gray,green,red,custom}`,
  `upload-set-bg-value`,
  `upload-set-stroke-color-{artwork,white,black,gray,green,red,custom}`,
  `upload-set-stroke-color-value`, `upload-set-marker-*`, `upload-set-reset`,
  `upload-set-close`), the metadata confirmation (`upload-meta-backdrop`,
  `upload-meta-{provider,endpoint,prompt,confirm,dismiss,cancel}`,
  `upload-preview-strip` / `upload-preview-{id}` +
  `upload-preview-caption-{id}`, `upload-preview-{count,busy,none}`),
  banners (`upload-warn-{excluded,corrupt,unreadable,interrupted}`), status
  bar (`upload-statusbar`, `upload-status-{counts,provider,meta,export}`),
  toast + busy (`upload-toast`, `upload-busy`); settings undo goes through
  the shared `hist-*` handles. Full table: `UI_SELECTORS.md` §Q.

## 12. Session restore, reset to pending & the global undo timeline (2026-10-01)

Design record: `docs/archive/2026-10-01-history-session/design.md`.

### 12.1 One store above the tabs

`Workbench` renders exactly one panel at a time, so panel-local `useState` is
destroyed on every tab switch. Everything a restart or a cross-tab undo must see
therefore lives in `src/state/appstore.ts` — a module-scope store bound to React
by `useAppState` / `useAppView` (`useSyncExternalStore`):

| slice | contents | persisted by |
|---|---|---|
| `tab` | the active tab | session |
| `sheets` | `padding`, `size`, `transparent` | session |
| `view` | `filter`, `sort`, `selectedId`, `collapsed`, `zoom`, `sync`, `autoNext` (shared by Selection and Selection V2) | session |
| `v2` | `checked`, `scrollY`, `anchorId` (the Shift anchor) | session |
| `prefs` | V2 `mode`, `thumbHeight` — held in memory only | `selectionv2/prefsstore` |

One owner per value, so the session file deliberately does **not** duplicate: the
last batch preset (`saveLastName`), a preset's `ignoreFolders` (`lib/presets`),
the V2 prefs (`prefsstore`), folder handles (IndexedDB via `batch/store`) or
decisions (`review-decisions.json`).

Restore happens in `state/boot.ts` **before** the first render, so no panel ever
paints defaults and then jumps. Autosave is debounced 250 ms
(`useSessionAutosave`) and prefs are written by `usePrefsAutosave`, both mounted
above the tabs so an undo applied while a panel is unmounted is persisted too.

### 12.2 The timeline

`lib/history.ts` is pure and holds the contracts (adapted from the reference
implementation, see the design doc): `{ entries, index }` with `index = -1`
meaning "before the first action", `MAX_HISTORY = 100`, `HISTORY_VERSION = 1`,
push truncates the redo branch, collapses a consecutive duplicate and drops the
oldest entry on overflow, `parseTimeline` validates and clamps on every read.
Each entry is `{ id, type, label, at, origin, ids[], before, after, v }` —
minimal before/after, never a full app snapshot.

`state/HistoryProvider.tsx` owns the clock/ids, persistence
(`state/historystore.ts` → `iconSplitter.history.v1`) and the shortcuts
`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` (ignored while typing in a
field). `ui/HistoryBar.tsx` shows the controls, the next-action label and a
read-only list of the timeline.

`pushGesture` coalesces one gesture (slider drag, search typing, arrow-key
navigation) into a single entry: the tip's `after` is replaced and the original
`before` kept.

### 12.3 The apply path and the failure rule

Every reversible change is applied through `state/apply.ts`, whether it came from
a click or from the timeline. A step returns the entry to apply and the new
cursor position separately (`stepBack` / `stepForward`), and the provider only
commits the cursor after the apply reported success — **a failed apply never
moves the cursor** and surfaces "That change could not be reversed".

Decisions go through `selection/offline.ts`: a mounted Selection/V2 panel binds
itself as the applier (so an undo lands in the same reducers a click uses); with
no panel mounted the stored `review-decisions.json` is patched directly from the
remembered root handle. Stale targets are skipped, never fatal.

### 12.4 Reset to pending

`withReset` is one transition for a whole batch, so a bulk reset is one history
entry and one summary line ("3 pairs reset to pending"). A pending pair owns no
record (I-13), the record is removed from the JSON, and pair identity, paths and
file metadata are untouched. Available for one item (`sel-reset` in the
comparison view) and for the selected / visible scope (`v2-reset-selected`,
`v2-reset-visible`).

### 12.5 Undoable vs not (documented and tested)

| undoable | not undoable (and why) |
|---|---|
| decisions: approve / decline / reset, single and bulk | batch processing — it writes files into the destination folder |
| checkbox selection, select visible, deselect all | ZIP / download / clipboard export — the file is already on disk |
| filters, sort, date mode and range | picking a folder — re-granting permission can be denied, so the app cannot promise it |
| view prefs (list/compare, thumbnail zoom), zoom, sync, auto-next, sidebar | switching tabs — navigation, restored on restart but not an edit |
| sheets padding / size / transparent | the folder watcher toggle — not persisted, so undoing it across a restart would be fiction |

Nothing in the right column is ever reported as reversed; the history simply does
not record it.

### 12.6 Storage map additions

| key | contents | owner |
|---|---|---|
| `iconSplitter.session.v1` | `{v, savedAt, tab, sheets, selection, selectionV2}` | `state/sessionstore` |
| `iconSplitter.history.v1` | `{v, entries, index}` capped at 100 | `state/historystore` |
| `iconSplitter.selectionV2.prefs.v1` | unchanged | `selectionv2/prefsstore` |

Both new payloads are validated field by field on read; a corrupt or
foreign-version payload costs one ignored load and the defaults, never a broken
startup (RULE 13).

### 12.7 Selection is one gesture, one entry

A row click used to push two entries (`checked`, then `view` for the active row),
so the first `Ctrl+Z` only moved the highlight and the selection came back on the
second press. `useSelectionV2.selectRow(id, intent)` now pushes **one** `checked`
entry whose `before`/`after` is `{ids, anchor, active}`: `applyChecked` reads all
three, and a bare array is still accepted so pre-anchor timelines undo cleanly.
The intents come from `lib/reviewselect`: `selectIntent` reads the modifiers,
`selectOne` and `selectRange` are pure, and `anchorId` lives in the session so a
Shift+click survives a tab switch.

The bulk bar is selection-only: **Approve selected**, **Decline selected** and
**Reset selected to pending**, each armed before it applies and each labelled
with the number of pairs that will really change
(`checked ∩ visible ∩ complete`). The visible-list variants were removed — a
bulk action reaching beyond the selection is exactly what the `v2-blocked` and
`v2-hidden` warnings are there to prevent.

The History window (`ui/HistoryPanel.tsx`, opened by `hist-open`) lists the whole
timeline newest first, marks the cursor and offers the same Undo/Redo. It is
read-only: clicking an entry would apply several changes at once, and a failed
apply must never move the cursor.

### 12.8 Undo must not depend on where the focus ended up

`selection/hotkeys` only skips a keystroke for a *text* surface: a text-ish
`<input>` (`text, search, number, email, password, url, tel, date, month, time,
datetime-local`), a `<textarea>`, a `<select>` or a contenteditable. A `range` or
`checkbox` passes the keystroke through, so `Ctrl+Z` still works after dragging
the zoom slider or clicking a row checkbox — the previous "any input is a text
field" test killed undo for the two controls the review tab uses most.

## 13. The global activity log, and the shell that stopped the dock blocking rows (2026-10-05)

Ported from `arena/01a10c14-iconsplitter@aaedf2e` ("verbatim prompt preview +
global activity log"); the prompt preview and the reasoning-tier caps that
commit also carried stay out — the first is a different feature, the second a
reversal this branch documented on 2026-10-05. Full record:
`archive/2026-10-05-global-log/design.md`.

### 13.1 What the log is

One docked panel, mounted once by `Workbench` as the last row of the app shell.
`src/lib/log.ts` owns the pure rules (schema, sanitising/redaction, the cap, the
ring buffer, formatting, validate-on-read); `src/log/logstore.ts` owns the live
state + the debounced persistence to `iconSplitter.log.v1`; `useLog` binds it to
React (`useSyncExternalStore`); `useAutoScroll` + `scroll.ts` own the follow
rule (24 px slack, pause on scroll-up, resume at the bottom); `LogHead`,
`LogList` and `LogRow` draw it. Entries are `{ id, at, level, feature, action,
ids, detail, data, v }` — `debug/info/warn/error`, one line, values trimmed
(`DETAIL_MAX_CHARS` 400, `VALUE_MAX_CHARS` 200, `DATA_MAX_KEYS` 12).

### 13.2 Who writes, and what may never be written

| Emitter | Entries |
|---|---|
| `ui/Workbench` | `app.open-tab` (the id of the tab, e.g. `tab=selectionV2`) |
| `state/HistoryProvider` | `history.push` / `history.push-gesture` (debug, the label + type + id count), `history.undo` / `history.redo`, `history.apply-failed` (error) |
| `svg/scan` | `svg.scan` (eligible/problems/unreadable/corrupt counts), `svg.scan-warning` (the same wording the user is told), `svg.scan-failed` (error) |
| `svg/actions` | `svg.root-picked`, `svg.prompt-reset`, `svg.config-changed`, `svg.sampling-changed`, `svg.review-decided`, `svg.confirm-opened`, `svg.generate-confirmed`, `svg.cancel-requested` (warn) |
| `svg/keystore` | `svg.key-saved` (the mask + whether it persisted), `svg.key-cleared` — never the key |
| `svg/runbatch` → `RunEvent` → `svg/runlog` | `svg.run-start`, `svg.request-start`, `svg.request-retry` (warn), `svg.item-start` (debug), `svg.item-saved`, `svg.item-failed` (error), `svg.request-failed` (error), `svg.request-done` (info, or warn for an unconfirmed outcome), `svg.cancelled` |
| `ui/pickroot` → the picking tab | `svg.root-picked` (`svg/actions`; the captured full path of the picked folder, or the completion flag) |
| `log/logstore`, `log/LogHead` | `log.cleared`, `log.max-entries`, `log.minimized`/`log.restored`, `log.copied` |

`withRunLog(sink)` wraps the runner's one event sink: the live UI gets the event
first, then the log records it, so the batch strip and the log can never
disagree. Two additions to this branch's own vocabulary made that honest rather
than approximate: `RunEvent.request-retry` (a retryable failure is now visible
while its wait runs instead of appearing only as the final report) and
`BatchOutcome.requestId` (a finished request's entry can name the provider id
that its sidecar and the in-flight journal already keep).

### 13.3 The shell, and the bug this port had to fix

The source branch docked the log with `position: fixed; bottom: 0` plus a spacer,
while every panel derived its height from the viewport (`.v2 { min-height:
calc(100vh - 3rem) }`). The dock therefore owned the bottom 236 px of the
viewport at every scroll position and received the clicks meant for the rows
painted there: at 1440×900 a hit test found two checkboxes per tab whose own
coordinates hit `log-body`/`log-entry`, and a real click on one left it
unselected (probe recorded in the archive doc). The fix is structural — the dock
is a row of `.app-shell`, `.app-main` is what scrolls, the panels are floored at
the band that is left and grow when their chrome needs more (a fixed-height
attempt collapsed the Generate SVG list to zero rows, which the same probe
caught), and the fixed toasts are lifted by `--app-dock-h`, the one value the
dock publishes. Invariants I-23…I-27; the layout gate is
`tests/log_layout.test.tsx`.

## 14. Folder copies and the remembered full path (2026-10-05)

A copy action used to hand over a **file**: `rootName\relPath` in Selection and
Generate SVG, and `rootName/relPath` — forward slashes, exactly the format
Explorer refuses — in the Batch tab. The user asked for the folder instead, as a
full Windows path that pastes straight into Explorer, and gave the target string
(`…\_split_output\2026-10\2026-10-01_10-24-31`). Full record:
`archive/2026-10-05-folder-path-copy/design.md`.

### 14.1 What the browser can and cannot know

The File System Access API tells the page the picked folder's **name** only
(`test_processing`); the drive and every folder above it are invisible for
privacy. So a pasteable path cannot be read — it has to come from the user's own
Explorer copy, captured when they pick the folder (§14.3). What was captured is
normalised (quotes, forward slashes, doubled and trailing separators, UNC pairs —
I-29) and remembered per folder name in `iconSplitter.rootpaths.v1`, so the same
folder picked in another tab gives the same text for free, and it is shown in the
read-only path row (§16, I-46). A hand-typed field (`ui/RootPathField`) existed
until 2026-10-05 and has been removed (I-45); with no capture the copies still
work and say so (`full path not captured`).

### 14.2 One function decides every copy

`lib/rootpath.folderCopyText(rootName, relPath)` and its one caller
`lib/copypath.copyFolderText` replace the three hand-written copies (the Batch
one had its own, with forward slashes). The rule (I-28, revised 2026-10-06 by
I-56): the copy names the **folder that contains the file** — the file name is
dropped, and no ancestor is skipped for looking like a month, a run stamp or a
`split_NN`. Until 2026-10-06 the tree rule stopped at the **batch folder**
instead; that reversal is what the user asked for, and the batch folder is
reached by copying an item that sits in it. (Historical note: the batch chain
used to be found from either side of the picked root — inside the
relative path, at its head (the output folder or a month folder picked as the
root), or the root itself being one run folder — see §17. Four surfaces use it:
the Batch scan table's row action, Selection V1's and V2's "original / AI
result" buttons and Generate SVG's "open location".

### 14.3 The path is captured at pick time (2026-10-05, I-35…I-37)

Reported: *"why it build the folder path not from my selected folder directly but
ask to put my full path folder manually? make it build full path from selecting
folder to scan. and give full path of selected folder visible."* The browser is
never told the path — `showDirectoryPicker()` yields `{ kind, name }` and nothing
else; a `File` from a handle has an empty `path`, a folder `input` gives only a
path *inside* the picked folder, and `startIn`/`id` remember a dialog's folder
without reporting it. What the column of the Explorer window does have is the
path on the clipboard ("Copy as path", `Ctrl+Shift+C`), and that is what the app
now takes:

* **One way to point the app at a folder to scan**: `ui/pickroot.pickRootWithPath()`,
  used by all three tabs' pickers. It reads the clipboard before the dialog (the
  click's activation is freshest there) and once more only if that read was empty
  (the other natural order: copy after picking), then matches the text against
  the folder that was really picked: the same leaf → adopted as *copied*; the
  copied parent → the picked name appended and flagged *completed*; a file path
  or a bare word → **nothing** is stored (I-29: no memory beats a guess).
* **The full path is visible with the root** (I-36): the row under the controls
  shows it once known (`ui/FolderBar`, §16) and names the state the value is in —
  the path, *completed — check it*, or *full path not captured*. The row follows
  the storage (`ui/FolderBar.useRootPath`, a subscription), so a capture in one
  tab is visible in the other without a reload. Until 2026-10-05 this was a pill
  plus a `Full path for copies` field with a `Use copied path` button and a
  status sentence; the row replaced all three (I-44/I-45).
* The storage keeps one entry per folder name and records *how* the path was
  obtained (`{ path, how }`, `how ∈ copied|completed`); a value written before
  this change — a bare string, or a `pasted` record from the field's days — is
  read as `copied`, so no memory is lost.
* The bug the pick-time capture exposed is fixed with it: a scan commit is built
  from a state snapshot, and when React batched it with the pick's own update the
  snapshot carried the **old** (empty) root name and won — what showed the root
  fell back to "Choose source folder…". `rescan` now takes the root's name from
  the handle it just walked, which is the only authoritative source.
  Regression-tested (`selectionv2_ui`: the path row shows the picked folder after
  the mount pick).

### 14.4 The Generate SVG tab can be pointed by hand

The picker used to render only while no root existed, so a tab that had
inherited the Selection tab's remembered handle had no way to choose a folder of
its own — reported as "now it takes the path already saved in selection tab …
fix the btn so I can select the folder here manually too". The source bar
(`svg/SourceLine`, extracted from `SvgControls` for the RULE 18 budget) now
always offers the picker: the shared green `Open folder` button (I-44, §16), with
or without a root, next to the rescan and the folder's path row. Picking there
remembers the handle under this tab's own key, so the fallback is only the first
run.

### 14.6 The reviewable set is the split output, and a path is only a folder path

Two reports, one working session. First: *"the selection tab v2 also incorrectly
adding the full unsplitted batches in to the list but should not use the folder
with files that was not splitted in root man folder. It should use created folder
where this files where added like \"_*split_*output\" fix it"*. The Batch tab has
always ignored its own output (`presets.ignoreFolders = ["_split_output"]`); the
Selection tabs and Generate SVG never applied the rule — `rescan` and
`discoverApprovedSources` walked the picked folder in full, so a batch root was
listed twice: the unsplit sheet pair at the root (the batch's **input**) and one
pair per split piece inside `_split_output` (the result). Per I-38 the scope is
now decided from the tree's directories (`lib/splitscope`), the list keeps only
what is inside a split-output folder, and everything hidden is counted, said and
logged (I-40) — the sheet pair the user was told not to review is named as an
`outside-split` exclusion in Generate SVG and never written.

Second: *"why it copy svg to file path. it only for path explorer dir nothing
else. bug."* — a screenshot of the root pill and the Full-path field holding
`<svg xmlns="http://www.w3.org/2000/svg" width="25…`. The guard ran too late:
`isPathLike` judged the **normalised** text, and `normalizeRootPath` had already
turned the markup's `/` into `\`, so `…"http:\www.w3.org\2000\svg"…` looked
like a path and was stored; the field additionally stored any text at all. Per
I-39 `isFolderPathText` now judges the raw text (drive or UNC only), at the
clipboard at pick time and by the one writer, and again on read — a junk value
written by an older build counts as no memory — while the field that accepted it
by hand has since been removed altogether (I-45, §16). The app never lies about
what a copy will hand over: the path row shows the captured path or the folder's
name with *full path not captured* (I-46).

## 15. One JSON per pair — the fix for "the folder shows only the AI approval" (2026-10-05)

The report: *"i don't see json in local folder contain information about SVG
aproval. only AI image aproval"*. Both halves existed, in different places: the
AI-image approval lived in `<root>/review-decisions.json` (ONE file for the whole
picked tree, far from the images) while the SVG's own review lived in the
`<stem>.svg.json` beside the pair. A folder that was copied, moved or opened on
its own lost the approval; the file the user was looking at never said anything
about the pair.

Per I-41 both halves are now **one file per pair, in the pair's own folder**:
`<AI stem>.svg.json`, `v: 2`, carrying the pair identity + both image faces +
`decision`/`reviewedAt` + `versions[]` (status, review, prompt, provider/model,
timestamps, tokens, cost `{actual, estimated, currency, pricing, basis}`,
validation, batch ref, error, requestId). The Selection tabs read their
decisions from those files (`selection/pairstore.loadPairDecisions`), Generate
SVG discovers approved pairs from them (`svg/sources.discoverApprovedSources`),
and every writer — approve/decline/bulk/reset, generation, SVG review and both
undo paths — writes through `savePairDecision`/`saveMetaAt`, so no code path
touches a global decision file any more.

The migration is read-only (I-42): `review-decisions.json` still supplies
decisions for pairs that have no local file and is never written or deleted; a
local file always wins, including an explicit `pending` (a reset must outlive
the fallback). A legacy `v: 1` file keeps its versions and is upgraded on its
next write. `selection/reviewstore.ts` is deleted; `LEGACY_FILE` and the
fallback merge live in `selection/pairstore.ts`.

Honesty under failure (I-43): an unreadable pair file is named — the banners
(`sel-pairfiles` / `v2-pairfiles`), the log and the row's own status — while the
in-memory decision for that pair is kept; the Retry button rewrites exactly the
pairs whose write failed (`SelState.retryIds`), never the whole tree. The SVG
tab's `svg/svgfiles.ts` keeps the file-level reads (version listing, SVG text);
the pair-file read/write lives in `selection/pairstore` + `lib/pairmeta`, and
`svg/sourceindex.ts` moved to `state/sourceindex.ts` because both tabs' undo
paths share that id → path cache.

## 16. One folder control, one path row (2026-10-05, I-44…I-46)

The report, verbatim: *"Folder control is unclear and displays the folder name as
the button. Obsolete Watcher and copied-path controls add noise. Full selected
path is not presented clearly."* Full record:
`archive/2026-10-05-folder-bar/design.md`.

Three toolbars carried three variants of one control: Selection V1's
`Root: {name}` button, V2's `v2-path-pill`, Generate SVG's `📂 Root: {label}`
span beside its own `Change folder…` / `Choose source folder…` button. Every one
of them was labelled with **state** — the folder's name, or the path once
captured — rather than with the action, and every one was followed by a
`Full path for copies` field with a `Use copied path` button and a status
sentence explaining why the browser cannot read the drive. V2 additionally
carried a `Watcher` pill that re-scanned the root every 30 s.

All three now mount one shared control, `ui/FolderBar`:

* `Open folder` — the same words in every state, the same green button class
  (`folder-open`, with `:hover`, `:active` and `:focus-visible` states in
  `index.css`), and the only control that opens the picker. It is offered whether
  or not a root is loaded (I-30), and each tab's empty state shows the same
  button (`sel-open-folder-empty` / `v2-open-folder-empty` /
  `svg-open-folder-empty`).
* `sel-folder-path` / `v2-folder-path` / `svg-folder-path` — a full-width,
  read-only row directly below the controls: the complete captured path in
  monospace text, whole value in its `title`, selectable like any text. No input,
  no button, no status line; the three states are the path, the same path plus
  `completed — check it`, and the folder's name plus `full path not captured`
  (I-46).
* Removed with it: `ui/RootPathField` (the field, the `Use copied path` button,
  the note), `ui/userootpath` (the live read lives in `ui/FolderBar`),
  `lib/rootpath.saveRootPath` (the field's own setter, and `PathHow` loses the
  `pasted` variant), `lib/clipboardpath.adoptCopiedPath` (the button's action —
  `readCopiedText` + `adoptCopiedText` stay, they are the pick-time capture), and
  the Watcher with its state and effect (`SelState.watcher`,
  `useSelection.useWatcher`, `WATCH_MS`).
* The pick-time capture (I-35) is untouched and is now the **only** writer of the
  memory: `ui/pickroot.pickRootWithPath` still reads the clipboard before and
  after the dialog, matches it against the folder that was really picked, and
  never invents a path. Its toast now says `Folder path captured: …` /
  `Folder path completed from the copied folder: … — check it`, because the path
  itself is on screen in the row.
* Rescan is unchanged in all three tabs (same handlers, labels and testids), and
  copies are unchanged (I-28): the real folder path when one was captured, the
  folder-name fallback otherwise.

## 17. Picking the batch's own output folder (2026-10-05, I-47/I-48)

The report names the two folders a user is most likely to pick after a batch:

```
…\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20   (one run)
…\test_processing_2\_split_output\                                (the batch root)
```

Both are folders the app created, and both are what a copy hands over — but the
scope filter read only the **relative** paths, so a picked output folder filtered
itself out. Measured (headless Chromium, real OPFS tree, Selection V2, the path
on the clipboard):

| Picked | Rows before | Scope before | Copy before |
|---|---:|---|---|
| the run folder | 2 | `whole folder — no split output found` | `…\…_split_output\2026-10\2026-10-05_18-45-20\icon-sheet_AI\split_02` |
| `_split_output` | **0** | `split output only · 2 pair(s) in the main folder not listed` | *(no row to copy from)* |

After the fix the same probe reads, for **both** picks: 2 rows in Selection V2,
2 rows in Generate SVG (`Audit — 6 files · 2 AI sources · 2 references excluded ·
0 missing files · 0 duplicates removed → 2 rows`, no `outside-split`), scope
`Scope: split output only`, and a copy that hands over the file's own folder —
since I-56 that is `…\<piece>\split_NN`, not the run folder. Design:
`archive/2026-10-05-picked-output-root/design.md`.

Two rules carry it. **Scope (I-47)** is now a decision about the set the picked
folder defines, not a segment of every relative path:
`lib/splitscope.scopeOf` returns `{ split, hideOutside }` — `split` when the
folder is an output folder, a run stamp, or holds one; `hideOutside` **only**
when the output folder lies strictly below the root (the `test_processing_2`
case, which keeps hiding and counting the unsplit sheets, I-38/I-40).
**Copy (I-48, replaced by I-56 on 2026-10-06)** used to find the batch folder from
either side of the root: the chain inside the relative path, the chain at the
head of it (`<month>/<stamp>` when `_split_output` or a month is the root), or
the root being one run folder. Since I-56 the root plays no part in the answer:
the copy names the containing folder of the file it was given. A near-miss
(`split_01`, `_split_output/latest`, a `2026-10` folder that holds no run) keeps
the item's own folder, exactly as before.

`lib/batchlayout.ts` is the one owner of the layout's names — `_split_output`
(tolerant variants), `<YYYY-MM>`, `<YYYY-MM-DD_HH-mm-ss>` — imported by
`lib/rootpath` and `lib/splitscope` instead of each repeating the patterns;
`svg/sourcelist.selectRows` takes `hideOutside` under its real name.

## 18. The same folders under any root (2026-10-05, I-49…I-51)

The report compares three picks of one batch:

```
…\test_processing_2                                   (the main folder — today's behaviour)
…\test_processing_2\_split_output                     (the batch root)
…\test_processing_2\_split_output\2026-10\<stamp>     (one run)
```

"all 3 dir should gave same result and same list of items" and "also unable to
display full folder path as folder was chosen". Measured on the two-run tree of
the probe (`probe_three_roots.mjs`, real OPFS, both tabs):

| Picked | Rows before | Scope before | Generate SVG before | Path row before |
|---|---:|---|---:|---|
| one run | 2 | `split output only` | **0 rows** (`2 missing files`) | exact |
| `_split_output` | 3 | `split output only` | **0 rows** (`3 missing files`) | exact |
| the month `2026-10` | 3 | `whole folder — no split output found` | **0 rows** (`3 missing files`) | exact |
| `test_processing_2` | 3 | `split output only · 1 pair(s) not listed` | *not measured (the baseline)* | exact |

After the fix, on the same tree: the run lists **2** pairs, `_split_output` and
the month list **3** (the same items — every pair below the pick), every scope
line reads `Scope: split output only` without "not listed", and Generate SVG
lists 2 / 3 / 3 rows with `Audit — 9 files · 3 AI sources · 3 references excluded
· 0 missing files · 0 duplicates removed → 3 rows` — no `outside-split`, no
`missing files`. The main folder is unchanged by design (I-38/I-40): the unsplit
sheet stays hidden **and counted** ("1 pair(s) in the main folder not listed").

Three causes, one per invariant. **A pair file written under another root** was
read with the paths and the id it was written with, so the pairs a scan of this
root found never matched those decisions and every approved source looked
missing (I-49 — I-49's rebase makes the file speak for the pair it sits beside).
**The scope filter recognised only `_split_output` as evidence**, so a month
folder — which is not an output dir but holds run stamps — fell back to "whole
folder", which then hid the pieces as if they were the main folder's sheets
(I-50). **The path row** completed a partial clipboard path by appending the
picked folder's name, which *dropped* every segment between the copied folder and
the pick (the month, in the report) and could just as well append the name to a
stale path of the same name elsewhere (I-51 — the app derives a path only from a
folder it already named, via `resolve()`, and never from a guess).

Scope of the change: `lib/pairrebase.ts` (new), `selection/pairrecord.ts` (new —
the record ⇄ pair-file mapping moved out of `pairstore`), `lib/pairmeta.ts`
(`rebaseMeta` moved out), `selection/pairstore.ts` (the read rebases; the id each
file carried still answers the legacy file), `lib/splitscope.ts` (run-stamp
evidence), `ui/knownroots.ts` (new), `ui/pickroot.ts`, `selection/rootsource.ts`
and `svg/scan.ts` (boot remembers the restored root). Design:
`archive/2026-10-05-root-independent-pairs/design.md`.

## 19. When the browser will not hand over the folder's path (2026-10-05, I-52)

Report, with the row on screen:

```
Open folder   Rescan   Scope: split output only
FULL PATH  _split_output   full path not captured
```

The list was right; the path never arrived and the row offered nothing to do
about it. Measured cause (headless Chromium, `probe_path_capture.mjs`, the
browser's clipboard stubbed per state): a pick captures the path from the
clipboard, and that read can fail in four ways the app could not tell apart —
the clipboard held a **copied folder item** (plain Ctrl+C puts a shell object
there, not text), the read was **blocked** (permission, focus, or an iframe
whose `allow` list omits `clipboard-read`), the user copied the path **after**
picking, or nothing was copied at all. In every one of them the row read
`full path not captured` and stopped.

I-52 turns the single attempt into a conversation:

* the pick is unchanged (read before the dialog, once after it if the first read
  was empty);
* **`Rescan`** — the existing button — makes one more exact-match attempt when
  the root's path is unknown, so a copy made after the pick lands with one
  click instead of another trip through the dialog;
* **`Ctrl+V`** anywhere outside a text field adopts the text for the root on
  screen: a paste event needs no permission and works inside iframes, so this is
  the way out when the Clipboard API itself is blocked;
* the read now reports `text` / `empty` / `blocked` / `unsupported`, and the UI
  says which: the toast names the reason, the row (`title` included) names both
  ways out.

What never changes: nothing is invented (outside the picker only an exact leaf
match is adopted — a pasted parent folder is not completed into a guess), no
read happens without the user's own gesture (a boot-time scan is silently
refused), and no new control appears — the bar is still one green button, one
`Rescan` and one read-only row. Design:
`archive/2026-10-05-path-capture-recovery/design.md`.

## 20. The API key that was saved and then gone (2026-10-07)

Report: the key "shows API saved" and is "stored locally", yet the app asks for
it again as soon as anything changes — an edit, a tab switch — and only a
freshly pasted key works; requests come back `400 API key not valid. Please pass
a valid API key.`

Measured cause, three faults in one path, all in how the key was kept:

* **A leaked IndexedDB connection per operation.** The store opened a new
  connection for every read and every write and closed none. The handles piled
  up, and a handle left open blocks any later version upgrade of the same
  database: the second tab's (or a new build's) `open` waits on `onblocked`,
  which the code answered with "no storage". So the key was written into a page
  that then had no working storage, and the next boot read nothing.
* **An empty Save that really wiped.** Saving with an empty field wrote
  `{key: null}` — clicking Save on a card whose draft had already been spent
  destroyed the key that was there.
* **A failed read that looked like an empty one.** Every failure path answered
  "no key", so a store that merely could not be read sent the user to paste a
  key the app was still holding.
* **The folder scan overwrote the key in memory.** The upload tab's scan takes
  its refs bag from the panel, and its `key` field was the *snapshot* key — so
  every scan wrote the folder's fingerprint (`6bcab92d`) into the ref that holds
  the API key. The card went on saying "secured locally" (its state comes from
  the boot read, which is correct) while the request carried the fingerprint as
  its key, and the provider answered exactly what the field reported:
  `400 API key not valid. Please pass a valid API key.` — appearing only after a
  tab switch, because returning to the tab is what runs the scan. The field is
  now named `scanKey` in both tabs (`SvgRefs.scanKey`, `UploadRefs.scanKey`,
  `UploadScanRefs.scanKey`): `key` means the provider key, and nothing else may
  be called that.

Now (RULE 10/20, `lib/keyvault`):

* the page keeps **one** connection, closes it the moment another tab needs the
  database (`versionchange`) and reopens on demand; a connection that errored,
  closed, was blocked or was taken away is never reused;
* `save("")` is `empty` — it changes nothing, and clearing is the separate,
  deliberate `Forget`; the editor's Save is disabled while the field is empty
  and the draft is dropped when the editor closes;
* `read()` reports **where the key came from**, and the UI says it: `device`
  ("secured locally"), `session` ("kept for this session only — paste again
  after a reload"), `unreadable` ("storage could not be read" / "this device's
  storage is unreadable here (private mode?)") and `none` ("no key yet"). A
  write the browser refused keeps the key usable for the session and says so;
* the key itself never changes place: still one IndexedDB slot per provider,
  masked in the UI, redacted from logs, never in a URL, a preset or an export.

Measured, not guessed: the regression test drives the real panel through the
real metadata request and asserts the header the provider receives — a tab
switch, then the send. Before the fix the header read `6bcab92d` (the scan's
snapshot hash); after it, the saved key. The same invariant is pinned at the
scan's own seam (`upload_scan.test.ts`: a scan writes `scanKey` and leaves the
`key` ref beside it untouched).

Honesty note: a key that the provider itself rejects is a different case — this
fix is about a key the app already holds, and a wrong or revoked key still
answers `400` from the provider.

## The four-point batch (2026-10-08, `four-point`)

* **Tags dedupe silently** (point 1): see the metadata policy above — one
  `dedupeTags` in `lib/upload/meta.ts` feeds BOTH `parseMetadata` and the tags
  edit path, so a pasted list with repeats becomes one clean list before the
  policy ever looks at it.
* **EPS 10 after the SVG is optimized** (point 2): the EPS stage runs on the
  CLEANED/optimized export SVG and writes an **EPS 10 /
  Illustrator-10-compatible** document — `%!PS-Adobe-3.0 EPSF-3.0`, the DSC
  order `%%Creator` → `%%Title` (the `${stem}.eps` name, DSC-escaped) →
  `%%CreationDate` (the run's clock) → `%%BoundingBox` (integer) →
  `%%HiResBoundingBox` (exact points) → `%%DocumentData: Clean7Bit` →
  `%%LanguageLevel: 3`, then EndComments/Prolog/Setup sections, the uprighting
  CTM and `%%EOF`. `verifyEps` requires those three markers, so a file that
  lost them is `partial`, never shipped as EPS 10.
* **Two global buttons** (points 3 + 4), both acting on the checked rows:
  * `upload-meta-selected` ("✦ Generate metadata (N)") — N counts the selected
    icons that have NO metadata text yet (a draft is not re-requested); rows
    that already have text are named in the status line instead of being paid
    for again, and at N = 0 the line says why nothing was sent.
  * `upload-export-selected` ("⇪ Export selected") — metadata first, then the
    WHOLE selection: the confirmation (`#upload-meta-title` "…, then export N",
    the note `upload-meta-then-export`) opens, each answer that passes the
    policy is accepted as it lands, and after the batch every selected icon is
    exported. An icon that already had metadata is exported, never re-charged;
    a policy-breaking answer stays a draft and that icon exports without it.
    With nothing to generate the export starts immediately. Needing metadata
    with no key is refused up front, naming the missing API key.
* **The batch → export handoff** (RULE 24): `acceptNow` records the accepted
  state in the run's own `MetaRunCtx.accepted` map, and `runExportBatch` prefers
  that map over re-reading `latest.current` — a `dispatch` is not visible in the
  rows until React re-renders, so reading them back exported the first icon
  WITHOUT its metadata. Never re-read `latest.current` for state the current
  task just dispatched.

## Export naming (2026-10-08, `export-naming`)

The user's rule (corrected the same day): *"only remove `_AI` but keep numbers,
`_03` etc."* A destination site must see the icon, not the app's marker, so the
artifact name is `stemOf(row.svgName)` from `lib/upload/export.ts`:

* strip the extension, then the `_AI` marker **and nothing else**;
* `fog_AI.svg` → `fog.svg` / `fog.jpg` / `fog.eps`; `fog_AI_03.svg` → `fog_03.*`;
* `icon-bunny-face_AI_7_04.svg` → `icon-bunny-face_7_04.*` (batch + split tails);
* `fog_AI_v2.svg` → `fog_v2.*` — the approved version stays visible in the name;
* `chat_bot_2_AI.svg` → `chat_bot_2.*`;
* no trailing `_AI` marker, or a non-numeric tail (`fog_AI_x.svg`), comes back
  unchanged — the name is never invented, only trimmed.

Keeping the digits is also what keeps two icons apart: `fog_AI.svg` and
`fog_AI_7.svg` are different pairs and export as `fog.*` and `fog_7.*`.

One rule, one home: `runexport.ts` no longer keeps a second private `stemOf`
(RULE 3/16.4), and `publishedJpegPath` (the Location action's path and the
export-path cell) derives from the same function, so the record, the file and
the UI cannot disagree.

**The folder's superseded artifacts are swept once the write is verified**
(`src/upload/exportsweep.ts`, own test suite). A folder exported before the
2026-10-08 naming change still carries the OLD artifacts — typically the EPS
(`fog.svg` + `fog.jpg` + `fog_AI.eps`) — and the user asked for the package to
end up under ONE name. After the new files are written and verified, and only
then, the sweep removes **what this app provably wrote and no longer writes**:

* candidates are only the icon's three artifact extensions whose bare name trims
  to **this icon's stem** under the very rule that produces the current names
  (`trimArtifactStem`), and which are not already `${stem}.${ext}` — so
  `export.json`, a readme, another icon's `arch_AI.svg` and every number-tailed
  name that belongs to a DIFFERENT icon (`fog_AI_7.eps`, `fog_AI_9_01.jpg`) are
  never candidates; near-misses (`fogv2.eps`, `fog_AI_x.eps`) are not either;
* a candidate the previous `export.json` still **names** goes only when the
  current artifact of that kind is on disk — an EPS stage that failed leaves the
  previous EPS alone rather than deleting the only copy of it;
* a candidate **no record names** is an orphan (the app lost track of it, no
  package claims it) — that is what a failed-then-recommitted EPS looks like, and
  it goes;
* `*.tmp` leftovers are left to the commit that owns them: the sweep does not
  guess.

The removals are reported in the run's result (`replaced`) and the record is
kept honest on both sides: it stops naming a file that was just removed, and it
KEEPS naming the files this run did not rewrite (`assembleRecord` seeds
`outputs` and the JPEG block from the previous record) — a selective re-export
used to blank the record's entries for everything it skipped.

Assumption recorded: one icon per export folder (the user's own tree — the
batch layout puts one piece per `split_NN` folder). Two paired sources whose
bases trim to the same name in the SAME folder would share one package; that
case is not in the corpus and would be caught by T28 when it lands.

### One stem for all three artifacts (why the EPS can never be named differently)

`commitExport` writes exactly four names into `export/` — `${stem}.svg`,
`${stem}.jpg`, `${stem}.eps` and `export.json` — and all three artifacts take
`stem` from the same `plan.stem` (`stemOf(row.svgName)`), so within one run the
EPS can never carry a different name than its siblings; the EPS's own
`%%Title` is `${stem}.eps` for the same reason. A differently-named `.eps` in a
folder can therefore only be a file no export of the current naming wrote: a
leftover from before the rename. The sweep removes such a leftover in both
shapes: named by the icon's own previous `export.json` (when the current EPS is
on disk), or an orphan no record names — an orphan still has to pass the naming
rule that proves the app wrote it, so a foreign file is never a candidate.
