# Upload EPS and stroke expansion

The optional EPS path in [SVG to upload](upload.md); exports are local and validated.

## Converter choices

* EPS converters (2026-10-09, design
  `docs/archive/2026-10-09-eps-converters-inkscape-expand/design.md`): the
  EPS writer is CHOSEN, not fixed. The registry `CONVERTERS`
  (`src/lib/upload/epsconv/registry.ts`) is the one table the drop list, the
  settings parser and the EPS stage read: `builtin` (the subset writer above,
  `writer: "builtin-subset-2"`) and `inkscape` (Inkscape on this machine
  through the local helper at `http://127.0.0.1:47391` — `GET /health` to
  probe, `POST /convert/eps` with the prepared SVG to convert, `writer:
  "inkscape-cli@<version>"` from the `x-inkscape-version` header). The
  setting `epsConverter` is NOT in the settings fingerprint: switching
  converters rebuilds the EPS only (the planner compares
  `tools.eps.converter` with the run's converter; a record from before the
  field is `builtin`), and choosing a converter never toggles `includeEps`.
  The built-in writer treats the prepared SVG `viewBox` as the intended artboard,
  including its white background rectangle: it keeps `%%HiResBoundingBox` exact,
  rounds `%%BoundingBox` outward for integer-only readers, and emits Illustrator's
  single-`%` `%AI5_ArtSize: height width` and centered `%AI3_TemplateBox` comments
  using the HiRes dimensions (the AI5 order is height before width). Its upright
  transform is anchored to that same exact rectangle. No `%%PageBoundingBox` is
  added because this writer emits EPS, not a page-structured PostScript document.
  The writer ID is `builtin-subset-2`; planning compares it as well as the
  converter so existing packages refresh the EPS only after this metadata change.
  After conversion, accepted metadata is embedded as the same Dublin Core XMP
  packet used by JPEG (`dc:title`, `dc:description`, `dc:subject`), using
  `%ADO_ContainsXMP: MainFirst` and an EPS pdfmark metadata stream with BDC/EMC
  around the drawing. EPS metadata is read back before and during atomic commit;
  a metadata edit refreshes requested EPS without rasterizing again. Every EPS
  — whoever wrote it — passes the SAME converter-neutral gate before commit
  (`verifyEpsDocument`: EPSF-3.0 header, a `%%LanguageLevel`, a `%%BoundingBox`,
  `%%EOF`); the stricter EPS 10 markers (`verifyEps`) are
  the built-in writer's own contract — and since 2026-10-09 `verifyEps` also
  runs the subset stack checker (`lib/upload/epscheck`, I-61), which the
  built-in converter applies to its own output before it answers ok. A helper that is down / an Inkscape
  not installed / a conversion refused → the EPS stage fails honestly with
  the reason AND its fix (`run_inkscape_bridge.bat`; "install Inkscape 1.x
  or set INKSCAPE_PATH") → `partial`, SVG/JPEG stay committed. The record
  names the converter and the writer: `tools.eps.{enabled, converter,
  writer, fixes?}`. The helper URL lives in localStorage
  `iconSplitter.upload.bridge.v1`. ONE probe runs before a batch that wants
  Inkscape EPS (RULE 9): a helper that is not usable is said up front
  (`EPS: <reason> — N rows will be partial · <fix>`, repeated on the batch's
  final line) and the batch runs anyway — the SVG and JPEG never wait.
* The Inkscape helper itself (`tools/bridge/server.mjs` + `inkscape.mjs`,
  started by `run_inkscape_bridge.bat` / `run_app_inkscape.bat`, any OS:
  `node tools/bridge/server.mjs [--port] [--inkscape] [--dist]`) is a
  dependency-free Node HTTP server on **127.0.0.1 only** (RULE 20 adapted:
  the artwork goes to a process on the user's own machine and nowhere else;
  the log names method, status, duration and byte counts — never content,
  never a package file name). `GET /health` → `{ ok, inkscape: { found,
  path, version, fix? }, port }`, found LIVE on every call (installing
  Inkscape while the helper runs is seen at the next Check, RULE 24); `POST
  /convert/eps` (SVG text, ≤ 20 MB) → `200 application/postscript` +
  `x-inkscape-version`, or JSON `{ reason }`: 400 not an SVG, 413 over the
  limit, 503 no Inkscape, 502 Inkscape exited non-zero (its last stderr
  line), 504 killed after 60 s (`BRIDGE_TIMEOUT_MS`), 499 the browser went
  away (the child is killed at once, RULE 7). Each conversion runs in its own
  temp folder (`in.svg` → `inkscape --export-type=eps --export-area-page
  --export-text-to-path --export-ps-level=3`), deleted in `finally` — never
  a half file; one conversion at a time. Discovery: `--inkscape` →
  `INKSCAPE_PATH` → PATH → the platform's default install folders. CORS/PNA:
  `Origin` `null` (a `file://` page), `localhost` and `127.0.0.1` get the
  allow headers (+ `Access-Control-Allow-Private-Network: true` on the
  preflight); any other origin is 403. `GET /` serves `dist/` (index.html,
  files below dist only) so `run_app_inkscape.bat` opens the app from the
  helper's own origin; without a build it says `run "npm run build"` (404,
  honest). Tested by spawning the REAL server against a fake Inkscape
  (`tests/helpers/fakeinkscape.mjs`, `tests/bridge_inkscape.test.ts`).
* Expand strokes to fills (2026-10-09, same design, D4): the setting
  `expandStrokes` (default off; fingerprinted ONLY when on, so no existing
  package flips to stale) makes the prepare stage turn every visibly stroked
  shape into a filled outline — what some stocks require — so the SVG, JPEG
  and EPS all ship without strokes. It runs AFTER the bake and the stroke
  restyle on every placement candidate (the setting's px IS the expanded
  width, whatever the artboard's scale) and BEFORE the global stroke pass
  (which then finds nothing to hoist): `src/lib/upload/expand.ts` (the DOM
  pass) over `src/lib/upload/geom/expand/` (`pen` vocabulary, `offset` —
  lines exactly, cubics by Tiller–Hanson checked at t = ¼ ½ ¾ against the
  true offset and split at ½ until the error ≤ TOL 0.01 px, depth ≤ 8, so
  curves stay curves; `joins` — the outer side gets miter-within-limit /
  round (≤ 90° KAPPA-family cubics) / bevel, the inner side pivots through
  the original vertex so every loop's winding fills under nonzero; caps butt
  / square (+ w/2) / round; a zero-length subpath is a dot / square /
  nothing; `arclen` + `dash` — `stroke-dasharray`/`-dashoffset` cut the
  subpath by arc length into open pieces BEFORE offsetting, each capped like
  a browser caps a dash, a boundary inside a curve is a de Casteljau split
  of that cubic, a closed dashed subpath opens at its phase and the dash
  that wraps the start is one piece; `assemble` — open: left side, end cap,
  right side back, start cap, Z; closed: left loop + right loop reversed =
  the ring in ONE `<path>`). The new `<path d fill=<the stroke paint>
  fill-rule="nonzero" [fill-opacity=<stroke-opacity>]>` sits right AFTER its
  original (paint order kept); the original loses every `stroke-*`
  attribute/style key, a `fill="none"` original is removed, containers lose
  their stroke properties too. Refused by name BEFORE the tree is touched
  (`prepare` fails `unsupported: … under Expand strokes on <tag>`, nothing
  commits): a `url(#…)` stroke paint, a negative dash value, a dash period
  under 0.01 px. Known, documented property: at sharp inner corners the
  pivot leaves small regions covered twice (winding 2) — identical under
  nonzero, what every non-boolean expander produces; the tests measure
  coverage, filled area and offset distance (`tests/helpers/outlinemath.ts`),
  never anchor counts. The record carries `tools.expand: { enabled, shapes
  }`; `PrepareResult.strokesExpanded` is the count; the row line appends
  `· strokes → fills`. `expandStrokes:false` is byte-identical to before
  (equivalence gate in `tests/upload_expand.test.ts`).
