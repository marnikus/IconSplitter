# Upload export validation and delivery

This page owns the local export copy, verification and atomic package. See [upload settings](upload-settings.md), [metadata](upload-metadata.md) and [EPS](upload-eps.md).

## Clean export SVG

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
  The artboard rectangle the prepare pass paints is fill-ONLY (`stroke="none"`,
  2026-10-08; since 2026-10-09 the stroke unification keeps that `none` exactly
  when the root hoists a paint): `stroke` is inherited, so an artwork that
  strokes on the root or a group would otherwise put a border around the whole
  artboard. The `<metadata>` subtree is the one
  place the clean pass leaves alone for both the check and the rebuild — it is
  the embed step's output (RDF/DC vocabulary by design), verified by its own
  readback, and the namespace rule still covers it (a declaration inside it is
  a violation, hoisted to the root).

The optional Upload shadow is a vector ellipse with referenced radial-gradient
stops from `src/svg/templates/shadow.svg`; the clean pass/SVGO keep only its
used, collision-free paint ID and rewrite the reference together. Preview and
JPEG rasterization consume the same prepared SVG, while the committed SVG is
cleaned and metadata-embedded as usual. A shadow-enabled settings fingerprint
also includes the template hash, so changing the template or percentages marks
only affected packages stale. With shadow off, the historic fingerprint and
byte-for-byte as-is shortcut remain unchanged. The optional [corner badge](upload-badge.md)
adds the supplied opaque paths above the artwork **after** fitting; preview,
JPEG, optimized SVG and built-in EPS share that vector. Badge-off files keep
their previous bytes/fingerprints, while enabled placement and template changes
mark only affected packages stale. Badge plus Shadow supports native vector EPS; unsupported alpha overlaps fail
closed, never rasterize. The optional [S/L size guide](upload-sizeguide.md) adds its
two baked repeats and letter paths the same way: off by default, shared with
every renderer, and fingerprinting only while enabled.

## Incremental export and commit

* Export: the stage planner re-runs only what changed (a metadata edit re-embeds
  without AI or raster render; when EPS is requested it also refreshes the EPS
  and its metadata; a missing output rebuilds just that output; nothing changed
  → no work). Before reusing a package whose accepted-metadata fingerprint still
  matches, it reads the existing SVG and requested EPS and compares Title,
  Description, and Tags; missing, unreadable, or mismatched metadata rebuilds
  only that SVG/EPS, never the JPEG. Every output validates before it commits
  (SVG parses + metadata readback; JPEG decodes at the recorded dims + XMP
  readback; EPS header and bounding box, plus accepted XMP readback) and commits
  atomically (tmp → verify → overwrite → cleanup, `export.json` LAST as the commit marker).
  A partial EPS stage or disabling EPS detaches any earlier EPS from the new
  record and Download all without deleting its old bytes, so a stale EPS
  cannot appear in a new package. A crash
  mid-commit leaves the last valid package in place. EPS is a genuine writer for a
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

## Download all

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

EPS delivery also enforces the [vector-only grammar and shading gate](upload-eps-gradients.md)
after metadata, on temporary and final readback, before cached reuse, and before
Download all. Any raster or unverified program fails the EPS stage/test; a header
or a matching old export fingerprint alone never certifies it.

Export runner progress, terminal cleanup and cross-tab headers: [shared process progress](process-progress.md).
