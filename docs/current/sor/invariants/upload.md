# Upload invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-60"></a>
* **I-60 (the artboard is the shipped artwork, RULE 4/13 — 2026-10-09):** the
  viewBox is computed from the bounds of the FINAL document — the configured
  stroke width, expansion, joins and caps included, measured by the strokes'
  real outlines — plus the padding; nothing visible lies outside it; a pinned
  artboard centres the shipped bounds within the [four-side padded rectangle](../upload-padding.md) to the file's precision; the artboard
  rect is always the first child (the background colour, or `fill="none"` when
  transparent); an enabled template shadow is centred below the *final painted*
  icon, sized/spaced by its width/height percentages and included in the fit,
  behind the icon but after the background. A selected corner badge is instead
  added **after** fitting, above the icon, with exact artboard-edge % insets;
  it cannot refit the icon or leave the shipped viewBox (a no-room placement
  fails by name; [badge contract](../upload-badge.md)). An enabled
  [size guide](../upload-sizeguide.md) is added after the stroke hoist and
  before that badge, shrinking uniformly or failing `no-fit`. With default/null padding the
  authored source viewBox (or width/height-only frame) is also an unpainted
  layout frame, extended only when the shadow overflows; an extension that
  would reveal formerly clipped geometry fails `unsupported`. Minor stroke-only
  viewport overshoot is repaired under the [bounded policy](../upload-auto-repair.md). Fully
  transparent or hidden paint has no sizing effect. The placement passes are recorded,
  with a bounded measured pinned-fit recovery after the four-pass fast path;
  impossible placement still fails by name (`no-fit`) instead of
  shipping a guess. Pinned by
  `upload_prepare` ("the artboard is the shipped artwork"), `upload_geom`
  (unpainted shapes have no bounds), `upload_optimize`/`upload_clean`/
  `upload_eps` (the invisible rect through the pipeline) and `upload_runexport`
  (`tools.artboard` agrees with the viewBox).

<a id="i-61"></a>
* **I-61 (the built-in EPS is an executable program, RULE 4/13 — 2026-10-09):**
  an EPS is PostScript; one invalid instruction and the interpreter stops before
  the artwork (the report: `-0.75 0 0 -0.75 0 750 concat` → `/typecheck` in
  Illustrator — `concat` takes ONE array). So: the uprighting CTM is written as
  `[a b c d tx ty] concat`; a shape with both paints fills inside its own
  `gsave … grestore` and THEN strokes (PostScript `fill` consumes the current
  path — the old `… fill … stroke` stroked nothing); a shape that paints
  nothing emits nothing (an unpainted path is not an object; the DSC box
  carries the artboard). And the program is CHECKED: `lib/upload/epscheck.
  checkPostScript` is an operand-stack model of the writer's own subset
  (numbers, `[…]`, `newpath moveto lineto curveto closepath concat setrgbcolor
  setlinewidth setdash setlinecap setlinejoin setmiterlimit fill stroke gsave
  grestore`) — arity, operand types, a current point before `lineto`/`curveto`,
  a path before `fill`/`stroke`, balanced `gsave`, an empty stack at the end —
  stopping at the first error like the interpreter and naming its line.
  `verifyEps` runs it, and the built-in converter runs `verifyEps` on its own
  output before answering ok, so a non-executable EPS is an EPS-stage failure
  (`partial`, SVG/JPEG committed), never a file. The converter-neutral commit
  gate (`verifyEpsDocument`) is unchanged: Inkscape's cairo PostScript uses
  procedures and dictionaries outside the subset's vocabulary and is not
  judged by it. Tests execute the subset too (`tests/helpers/psrun.ts`): every
  fixture runs without error and paints only inside `%%HiResBoundingBox`.
  No `showpage`, `%%Pages` or preview was added — none is required for an EPS
  import, and none was the cause.

<a id="i-62"></a>
* **I-62 ("scale to N MP" scales the artboard, not the JPEG, RULE 4/13 —
  2026-10-09):** on, in `content` mode only, the content fit is scaled
  uniformly so `artW × artH = N × 10⁶` (to the file's precision; exact in one
  pass when the artwork is all fills), strokes keep the verbatim px, the record
  carries `tools.artboard.scaledTo = N` (null whenever it does not apply), the
  fingerprint moves only while the box is on, and the JPEG keeps
  `jpegMegapixels`. Pinned by `upload_settings`, `upload_geom` (the megapixel
  fit), `upload_prepare` ("scale the artboard to N megapixels"),
  `upload_runexport` and `upload_eps_settings_ui`.

<a id="i-79"></a>
* **I-79 (row badges are labels, not artwork, RULE 10/12/13 — 2026-10-25):**
  named coloured badges on SVG-to-upload rows are independent of the corner
  badge. The catalog and per-pair assignments persist in
  `iconSplitter.upload.rowBadges.v1` and validate on read; a row may hold one
  or more ids; multi-apply toggles one catalog badge on checked ids, while Ctrl
  + left-click on a chip removes that badge from all checked rows (plain
  left-click removes from one row); successful stock re-uploads reassign the
  target badge. The list filter is All / none / any / one id. Labels are never
  exported or sent. Pinned by `upload_rowbadge`, `upload_rowbadge_store`,
  `upload_rowbadge_ui`, `stockupload_runner`, and `stockupload_ui`.

<a id="i-80"></a>
* **I-80 (Stock Upload lists only recorded `export/` artifacts, RULE 4/13 —
  2026-10-27):** the `"Upload"` (`stockUpload`) tab discovers items strictly
  from folders named `export` (including when the picked root itself is named
  `export`) that contain a valid committed `export.json`, and includes only
  output files both recorded in `export.json` and physically present (`size >
  0`) inside that `export` folder. Unrecorded stray files in `export/` and
  upstream files outside `export/` are never listed. Pinned by
  `stockupload_discovery` and `stockupload_ui`.

<a id="i-81"></a>
* **I-81 (Stock FTP/SFTP/ESP credentials are local-only and never expanded, RULE 20 —
  2026-10-27):** stock usernames/logins, passwords, and Getty ESP API keys/secrets
  are stored exclusively in the device's IndexedDB `secrets` store
  (`stock-ftp-cred:<presetId>`, with in-memory session fallback when IndexedDB is
  unavailable), never in `localStorage`, `export.json`, presets, or logs, and are
  never expanded or echoed back in the UI after saving. Pinned by
  `stockupload_credvault`, `secret_hygiene`, and `stockupload_ui`.

<a id="i-82"></a>
* **I-82 (a Getty web run is closed batches of at most 100 uploads, RULE 4/13 —
  2026-10-30):** one icon is one upload — its JPEG plus its optional matching EPS,
  listed once by Getty — so a batch holds at most **100 icons** (≤ 200 files),
  never 200 icons; `GETTY_WEB_MAX_BATCH_ICONS` and the helper's `MAX_ICONS` must
  agree and the pair is never split across batches. Each batch is uploaded with
  `newBatch: true` (the helper resets the previous batch id, expected names and
  counts), then **completed before the next is created**; a refused finish leaves
  its batch open and claims nothing. An icon with no thumbnail or "Upload failed"
  is **re-queued, not reported**, for at most two attempts: queued icons fill the
  remaining room of a later primary batch, leftovers become the run's final
  `retry` batch(es), and only a terminal outcome writes the row. `auth`,
  `browser` and `helper-down` stop the run; every unreached icon is reported failed
  with that reason. A session with a request in flight is never swept by the idle
  timer. Pinned by `getty_web_chunk`, `stockupload_getty_web`,
  `getty_web_upload`, `bridge_getty_web` and `getty_web_session`.

<a id="i-83"></a>
* **I-83 (the Getty web request keeps its per-icon manifest in the body, never a
  header, RULE 4/7 — 2026-10-30):** `x-getty-web-config` carries settings,
  credentials and `manifestBytes` only (< 8 KB); the manifest is the **last
  `manifestBytes` bytes of the body**, after the staged file bytes. 100 icons with
  2 KB descriptions is a ~290 KB base64 header, and Node's 16 KB `maxHeaderSize`
  answers **431 and destroys the socket before any route runs** — the 209-icon
  failure, not a size cap and never a missing helper. `configFromBody` rebuilds
  the config before validating, an older `icons` header still works, and the
  helper's own `maxHeaderSize` is 1 MB as defence. Pinned by `getty_web_upload`
  (header < 8 KB, body > 200 KB) and `bridge_getty_web` (200 KB manifest).

<a id="i-84"></a>
* **I-84 (a stuck Getty batch page is reloaded before it is written off,
  2026-10-30):** cards that never turn "Ready to submit" get, per batch and in
  order, a re-save, a **reload plus re-save** (twice), then a re-upload from the
  staged copy; a listed card with no picture is that same stall. Pinned by
  `getty_web_finalize` and `getty_web_batch`.
