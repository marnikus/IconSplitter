> Status 2026-10-09: commit A (registry, settings, dialog UI, Inkscape
> client, converter-neutral `verifyEpsDocument` gate) and B (the helper
> `tools/bridge/`, the `.bat` launchers, the pre-batch probe) landed; C
> (stroke expansion geometry) follows in its own commit.

# EPS converters drop list · Inkscape CLI helper · Expand strokes to fills

Date: 2026-10-09 · Area: SVG to upload (export pipeline) · Status: DESIGN — confirmed by the user 2026-10-09, no code yet

**Confirmed answers (2026-10-09):** Q1 local helper = **yes**; Q3 expansion engine v1 = **built-in geometry**
(Inkscape-side union stays a phase-2 option); Q4 dashed strokes = **must expand in v1** (arc-length dash splitting is in scope);
Q5 Inkscape = **not installed yet** (the "not found" path is a first-class state in the UI and README, and tests run on a fake binary).

## 1. What the user asked for

1. A **drop list** on the export settings to choose between several EPS converters.
2. A new **Inkscape CLI framework** that also converts SVG → EPS.
3. **Expand stroke width to fills** ("outline strokes") — some stocks require vector
   files with no strokes, so a line icon must ship as filled shapes.

Process: TDD, every rule in `docs/current/AGENT_RULES.md`, RULE 16 gates and RULE 18
ideal sizes re-checked at the end, same-commit docs (SOR rows, UI_SELECTORS, docs/README,
QUALITY_RECHECK), commit `<type>(<area>): …` + `Verified:` line, push to
`arena/086ed6a7-iconsplitter`.

## 2. Facts that shape the design (research, read-only)

| Fact | Where | Consequence |
|---|---|---|
| The app is a **single `dist/index.html`** opened from `file://` (`run_app.bat`), or the Vite dev server; there is **no backend** | `run_app.bat`, README | A CLI (Inkscape) can only be reached through a **local helper process** on the user's machine |
| RULE 20: images never leave the browser; no third-party sees content | AGENT_RULES | The helper must bind **127.0.0.1 only**, keep no content logs, and the browser stays the ONLY writer of the package |
| Pipeline: `prepare` (clean → bounds → fit → **bake** → restyle strokes → unify strokes → artboard) → `optimize` (SVGO + clean) → `embed` → `render` (JPEG) → `eps` → `validate` → `commit` | `src/upload/exportstages.ts`, `src/lib/upload/prepare.ts` ~65–90 | Stroke expansion belongs in `prepare` AFTER restyle (the setting's width is what gets expanded) and BEFORE unify; every output (SVG, JPEG, EPS) then derives from stroke-less geometry |
| The ONE outline model gives absolute `M/L/C/Z` ops for every shape after the bake | `geom/outline.ts`, `geom/ops.ts`, `geom/shapes.ts` | The expander works on that model only — no second geometry grammar |
| Stroke state (width, paint, cap, join, miterlimit) is resolved by `inheritStroke`; `strokeHits(root)` lists every element with its CTM + stroke | `geom/stroke.ts`, `geom/bounds.ts` ~40–85 | The expander reads the pen from there; it never re-parses attributes |
| EPS today: `writeEps(svg, bg, opts) → {ok, eps, boundingBox, shapes, fixes} | {ok:false, reason}`; `verifyEps` gates every EPS before commit | `src/lib/upload/eps.ts`, `epsdoc.ts` | The built-in writer becomes ONE converter behind a common interface; `verifyEps` stays the gate for ALL converters (RULE 15) |
| `buildEps` is sync and runs inside `buildArtifacts`; a failure sets `art.epsFailure` → row `partial` | `exportstages.ts` ~98 | `buildEps` becomes async (the Inkscape converter is a network call); the failure semantics are unchanged |
| `ExportRecord.tools.eps = { enabled, writer: "builtin-subset-1", fixes? }`; `parseExportRecord` is tolerant | `src/lib/upload/export.ts` ~79, ~122 | Record the converter id + version; older records read back as `builtin` |
| `settingsFingerprint` is a canonical array; any change to it makes EVERY existing package stale | `settings.ts` ~235 | New fields must be appended **conditionally** (only when non-default) so existing packages keep their fingerprint |
| `planStages`: a settings-fingerprint change rebuilds the whole geometry chain; `planToggleDeltas` handles EPS-only toggles | `export.ts` ~194–230 | The converter choice is a TOOL change → EPS-only rebuild (not in the fingerprint); `expandStrokes` is a GEOMETRY change → in the fingerprint |
| Settings dialog: `NumberSetting`, `ToggleSetting`, paint rows; every change live (RULE 24) | `UploadSettingsDialog.tsx` | Add ONE generic `SelectSetting` (the drop list) and reuse `ToggleSetting` for Expand strokes |
| Gemini provider card pattern: URL field + "check" button + live state line | `upload-provider-card`, `upload-model-check` | The Inkscape helper gets the same shape: URL + Check + state |
| Lint covers `src tests tools`; RULE 16 gate measures `src/` | `package.json`, `tools/quality.mjs` | The helper lives under `tools/bridge/` (linted) and still follows the size rules by hand |
| vitest runs in happy-dom; per-file `// @vitest-environment node` is available | `vitest.config.ts` | Helper tests run in node, spawning the REAL server with a FAKE `inkscape` executable (RULE 8) |

## 3. Decisions

### D1 — A converter registry; the drop list is its table

```ts
// src/lib/upload/epsconv/types.ts
export type EpsConverterId = "builtin" | "inkscape";
export interface EpsConvertInput { svg: string; background: string; title: string; createdAt?: string }
export interface EpsConverter {
  id: EpsConverterId;
  label: string;                      // "Built-in (PostScript subset)" · "Inkscape CLI (local helper)"
  /** Is this converter usable right now? Pure for builtin; a GET /health for inkscape. */
  probe(deps: ConverterDeps): Promise<ConverterState>;   // { ok: true, version } | { ok: false, reason, fix }
  convert(input: EpsConvertInput, deps: ConverterDeps, signal?: AbortSignal): Promise<EpsResult>;
}
```

* `EpsResult` is the existing shape (`ok` + `eps` + `boundingBox` + `shapes` + `fixes`, or `reason`),
  plus `writer: string` (`builtin-subset-1`, `inkscape-cli@1.3.2`) for the record (RULE 22).
* `CONVERTERS: Record<EpsConverterId, EpsConverter>` is the table the drop list, the stage and
  the record parser all read (RULE 10: one owner). Adding a converter = one file + one table row + one test.
* `builtin.ts` wraps `writeEps` unchanged. `inkscape.ts` is a thin HTTP client to the helper (D2).
* Every converter's output passes the SAME gate: `verifyEps` (header, `%%BoundingBox`, non-empty),
  then the existing atomic commit. The browser remains the only writer of the package (RULE 15/20/23).

### D2 — The Inkscape CLI helper (`tools/bridge/`)

A small Node HTTP server on the user's machine, started by `run_inkscape_bridge.bat`
(or `run_app_inkscape.bat`, which starts the helper AND opens the app through it — see "origin").

| Endpoint | Request | Response |
|---|---|---|
| `GET /health` | — | `{ ok, inkscape: { found, path, version }, port }` — `found:false` carries `fix` text ("Install Inkscape 1.x or set INKSCAPE_PATH") |
| `POST /convert/eps` | body = SVG text (`image/svg+xml`, ≤ 20 MB) | `200` EPS text (`application/postscript`), or `4xx/5xx` JSON `{ reason }` — never a half file |
| `POST /expand/svg` *(phase 2 — see D4 and open question Q3)* | SVG text | plain SVG with `object-stroke-to-path` applied |

Mechanics (all in the helper, never in the browser):

* **Binary discovery**: `INKSCAPE_PATH` env → `--inkscape <path>` flag → `PATH` → Windows defaults
  (`C:\Program Files\Inkscape\bin\inkscape.com`, then `inkscape.exe`), macOS app bundle, `/usr/bin/inkscape`.
  `inkscape --version` is parsed once at start and on every `/health` (so installing Inkscape while the helper runs is seen live, RULE 24).
* **Conversion**: write the SVG to `os.tmpdir()/iconsplitter-<random>/in.svg`, run
  `inkscape in.svg --export-type=eps --export-filename=out.eps --export-area-page --export-text-to-path --export-ps-level=3`,
  read `out.eps`, delete the temp folder in `finally`. Timeout 60 s → kill the child → `504 { reason }`.
  One conversion at a time (a queue); the batch is sequential anyway.
* **Interruption** (RULE 7): the browser passes the run's `AbortSignal` to `fetch`; the helper kills the child on request `close`.
* **Origin / CORS / Private Network Access**: the helper answers `Access-Control-Allow-Origin` for `null`
  (a `file://` page), `http://localhost:*` and `http://127.0.0.1:*` only, plus the PNA preflight header
  (`Access-Control-Allow-Private-Network: true`). It ALSO serves `dist/` at `/`, so `run_app_inkscape.bat` opens
  `http://127.0.0.1:<port>/` — same origin, no CORS at all, and the File System Access API still works (localhost is a secure context).
* **Privacy** (RULE 20 adapted): binds `127.0.0.1` only; logs method, status, duration, byte counts — never content, never file names from the package.
* **Port**: default `47391`; `--port` flag; the app's helper URL defaults to `http://127.0.0.1:47391` and is editable (D3).
* **Not in scope now**: Inkscape `--shell` mode for faster batches (one process, many files) — a later optimisation; the interface does not change.

### D3 — Settings, record, UI

`UploadSettings` gains two fields (defaults keep today's behaviour exactly):

| Field | Type | Default | Fingerprint | Plan effect |
|---|---|---|---|---|
| `epsConverter` | `EpsConverterId` | `"builtin"` | **not** in the settings fingerprint | `planToggleDeltas`: `record.tools.eps.converter !== input.epsConverter` → EPS-only rebuild (like the `includeEps` toggle) |
| `expandStrokes` | `boolean` | `false` | appended to the canonical array **only when true** (existing fingerprints unchanged) | geometry change → full rebuild (already how the fingerprint works) |

* `normalizeSettings` / `parseOverrides`: `epsConverter` read through `parseConverterId` (unknown → default, RULE 13); `expandStrokes` joins `readFlags`.
* Per-icon override works for both (the dialog's icon scope pins them like any field).
* `ExportRecord.tools.eps` → `{ enabled, converter: EpsConverterId, writer: string, fixes?: string[] }`
  (older records: `converter` absent → `builtin`). New block `tools.expand: { enabled: boolean; shapes: number }`.
* Helper URL: device config, not an export setting — `iconSplitter.upload.bridge.v1 = { url }` beside the Gemini config
  (`configstore.ts` pattern; parse/clamp in `lib/upload/epsconv/bridgeconfig.ts`, RULE 13).

UI (settings dialog, `UploadSettingsDialog.tsx`):

| Handle | Element | Behaviour |
|---|---|---|
| `upload-set-eps-converter` | `<select>` | the drop list from `CONVERTERS`; live (RULE 24); shown with `includeEps` regardless of its state (choosing a converter never toggles EPS — RULE 10) |
| `upload-eps-helper` | row (only when `inkscape` is chosen) | URL `<input>` `upload-eps-helper-url`, button `upload-eps-helper-check`, state `upload-eps-helper-state`: "helper running · Inkscape 1.3.2" / "helper not reachable at … — start run_inkscape_bridge.bat" / "helper running, Inkscape not found — …fix…" |
| `upload-set-expand` | checkbox | "Expand strokes to fills" — hint: "strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes" |

Row settings line (`UploadRow.tsx` ~144): `eps on · inkscape` / `eps off`, and `strokes → fills` when expanded.
The probe runs when the dialog opens with `inkscape` selected, on Check, and once before an export batch
(so the drop list state the user sees is the state the run will meet).

### D4 — Expand strokes: the built-in geometry expander (`src/lib/upload/geom/expand/`)

Runs inside `prepareExportSvg` after `restyleStrokes` and before `unifyStrokes`, only when
`settings.expandStrokes` is true. Pure: DOM in → DOM out, counts returned (RULE 3).

For every `strokeHits` entry that is a shape, visibly stroked (`!none`, width > 0):

1. **Outline**: `shapeOutline(el)` → absolute ops (the bake already removed transforms). Split into subpaths at `M`; `Z` marks closed.
2. **Pen**: `{ width, cap, join, miter }` from the hit's `Stroke` (after restyle, so the setting's px is the width).
3. **Segment offsets** at distance `w/2`, both sides:
   * line → exact parallel line;
   * cubic → Tiller–Hanson offset of the control polygon, checked at t = ¼, ½, ¾ against `P(t) + d·n(t)`;
     if the error exceeds `TOL = 0.01` px, split at t = ½ and recurse (depth ≤ 8). Curves stay curves —
     no polyline faceting in the shipped file.
4. **Joins** at each interior vertex (and the closing vertex of a closed subpath): the outer side gets the join
   — `miter` when within `stroke-miterlimit`, else `bevel`; `round` = arc as ≤ 90° cubics (same KAPPA arcs as
   `shapes.ts`). The inner side goes **offset end → original vertex → next offset start** (the pivot), which keeps
   every loop's winding consistent so the nonzero rule fills it correctly.
5. **Caps** on open subpaths: `butt` = line across; `square` = both sides extended by `w/2`, then across;
   `round` = a semicircle (two cubics). A zero-length subpath becomes a dot (round) / square (square) / nothing (butt), per SVG.
6. **Assembly**: open → left side forward, end cap, right side backwards, start cap, `Z`; closed → left loop `Z` + right
   loop reversed `Z` (two subpaths of ONE `<path>`: the ring).
7. **Emit**: `<path d=… fill={strokePaint} fill-rule="nonzero">` (plus `fill-opacity` from `stroke-opacity` when present)
   inserted right AFTER the original (SVG paints fill then stroke, so the order is preserved). The original keeps its own fill and
   loses every `stroke-*` attribute/style key (`stripStyleKeys`); an original with `fill="none"` is removed entirely.
   `unifyStrokes` then finds nothing stroked → the root carries no stroke properties (the existing clean rules already accept fill-only files).
8. **Numbers**: 3 decimals via the model's writer (`outlineToPathData`).

**Dashes (v1, confirmed)** — `stroke-dasharray` / `stroke-dashoffset` on an expanded stroke: the subpath is cut by arc length into
dash pieces BEFORE step 3, each piece an open subpath that gets the pen's caps (SVG semantics: caps on every dash). Arc length of a
cubic comes from adaptive subdivision to `TOL` (the same splitter as the offset), so a dash boundary inside a curve is a real split
point of that cubic (de Casteljau at the found `t`), never a chord. Odd-length arrays repeat (SVG), all-zero arrays = solid, a negative
value is a refusal by name. A closed dashed subpath opens at its dash phase like the browser renders it.

Honest refusals (RULE 4 — named, never guessed), reported as a `prepare` failure `unsupported: …`: a stroke paint that is a
`url(#…)` reference (the fill would reference a gradient the EPS subset refuses anyway — refused up front so the SVG and EPS agree),
a negative dash value, a dashed stroke whose pattern period is < `TOL` (would explode into thousands of pieces).

Known, documented property: at sharp inner corners the pivot leaves small self-overlapping regions inside the fill — they render
identically under nonzero and are what every non-boolean expander produces; a true union needs a boolean engine
(Inkscape's — see Q3). Tests measure area and offset distance, not anchor counts.

### D5 — Failure semantics and reporting

| Situation | Outcome | Where it is said |
|---|---|---|
| `inkscape` chosen, helper not reachable / Inkscape not installed / timeout / bad output | EPS stage fails honestly → row `partial`, SVG+JPEG committed (as today for any EPS failure); `error` = the probe's `reason` + `fix` | row error, `exported` log line, batch toast tail (`· N EPS failed — helper not running`) |
| `inkscape` EPS fails `verifyEps` | same as above: nothing is committed for the EPS (RULE 15) | same |
| `builtin` chosen | exactly today's behaviour, including `fixes` | unchanged |
| `expandStrokes` on and a refusal (dash, url paint) | `prepare` fails → row `failed`, nothing committed (geometry is shared by every output) | row error names the element |
| Export batch cancelled mid-conversion | `fetch` aborts, helper kills Inkscape, row `cancelled` (RULE 7) | existing cancel path |

Pre-batch probe: when ANY row in the batch resolves to `inkscape` and the probe fails, the batch still runs
(RULE 9: the other outputs never wait) and the toast says up front "EPS: helper not reachable — N rows will be partial".

## 4. Owner files (RULE 18 ideals; new files ≤ 300, functions ≤ 30 lines, params ≤ 4)

| Path | New/Edit | Owns | Ideal |
|---|---|---|---|
| `src/lib/upload/epsconv/types.ts` | new | `EpsConverterId`, `EpsConverter`, `ConverterState`, `ConverterDeps`, `parseConverterId` | ~60 |
| `src/lib/upload/epsconv/registry.ts` | new | `CONVERTERS` table, `converterLabel`, `converterIds` | ~40 |
| `src/lib/upload/epsconv/builtin.ts` | new | wraps `writeEps` → `EpsConverter` | ~40 |
| `src/lib/upload/epsconv/inkscape.ts` | new | HTTP client: `probe` (GET /health), `convert` (POST /convert/eps), error → `{reason, fix}` | ~120 |
| `src/lib/upload/epsconv/bridgeconfig.ts` | new | `BridgeConfig {url}` parse/serialize, default URL/port constant | ~50 |
| `src/lib/upload/geom/expand/pen.ts` | new | `Pen`, `Side`, vector helpers (`normal`, `tangentAt`, `cross`), cap/join enums | ~110 |
| `src/lib/upload/geom/expand/offset.ts` | new | line + cubic offsetting (Tiller–Hanson, error check, recursive split) | ~150 |
| `src/lib/upload/geom/expand/joins.ts` | new | outer joins (miter/bevel/round arcs), inner pivot, caps | ~150 |
| `src/lib/upload/geom/expand/arclen.ts` | new | cubic arc length + `splitAt(length)` by adaptive subdivision (de Casteljau) | ~110 |
| `src/lib/upload/geom/expand/dash.ts` | new | dash pattern normalisation (repeat, offset, all-zero), subpath → dash pieces | ~120 |
| `src/lib/upload/geom/expand/assemble.ts` | new | subpath split, open/closed assembly, dot case → `Outline` | ~130 |
| `src/lib/upload/expand.ts` | new | the DOM pass: hits → outline → pen → path element; vetoes; counts | ~120 |
| `src/lib/upload/prepare.ts` | edit | call `expandStrokes(root)` between restyle and unify; `PrepareResult.strokesExpanded` | +12 |
| `src/lib/upload/settings.ts` | edit | two fields, defaults, normalize/overrides, conditional fingerprint | +25 |
| `src/lib/upload/export.ts` | edit | `tools.eps.converter`, `tools.expand`, tolerant parse, `planToggleDeltas` converter delta | +25 |
| `src/upload/exportstages.ts` | edit | async `buildEps` via `CONVERTERS[settings.epsConverter]`, `Artifacts.epsWriter` | ±10 |
| `src/upload/runexport.ts` | edit | record `tools.eps.converter/writer`, `tools.expand`; `ExportRunDeps.bridge` | +10 |
| `src/upload/exportactions.ts` | edit | pre-batch probe + toast line; failed-EPS tally in `exportBatchLine` | +20 |
| `src/upload/uploadlog.ts` | edit | `exportBatchLine` gains `epsFailed`; probe line builder | +15 |
| `src/upload/UploadSettingsDialog.tsx` | edit | `SelectSetting` (generic), Expand toggle, helper row component | +45 → split `UploadEpsSettings.tsx` if > 300 |
| `src/upload/UploadEpsSettings.tsx` | new | converter select + helper URL/Check/state row | ~110 |
| `src/upload/configstore.ts` | edit | `loadBridgeConfig` / `saveBridgeConfig` | +15 |
| `src/upload/UploadRow.tsx` | edit | settings line: converter + expand | +4 |
| `tools/bridge/server.mjs` | new | HTTP server, routes, CORS/PNA, static `dist/`, queue, logging | ~200 |
| `tools/bridge/inkscape.mjs` | new | binary discovery, `--version`, `convertEps(svgText)` with temp dir + timeout + kill | ~150 |
| `run_inkscape_bridge.bat`, `run_app_inkscape.bat` | new | start helper / start helper + open app through it | — |
| `src/index.css` | edit | `.up-helper-state` ok/warn colours | +4 |

Directory cohesion (RULE 18): `geom/expand/` is a new 6-file module (changes together); `epsconv/` a 5-file module;
`src/lib/upload/geom/` stays at 11 files; `src/lib/upload/` grows by 1 (`expand.ts`).

## 5. TDD steps (each step: red tests → code → `npx tsc --noEmit` · `npm run lint` · `npm run quality:changed`)

Commits are per feature so each lands green on its own: **A** (registry + settings + UI),
**B** (helper + Inkscape converter), **C** (expand strokes). Each commit updates the docs it touches.

### A — Converter registry, settings, drop list (built-in only runs; the list already has both entries)

1. `tests/upload_epsconv.test.ts` — `CONVERTERS` has `builtin` + `inkscape`; `parseConverterId("x") === "builtin"`;
   `builtin.convert` equals `writeEps` byte for byte on `PREPARED` (from `upload_eps.test.ts`) and returns `writer: "builtin-subset-1"`.
2. `tests/upload_settings.test.ts` — defaults `epsConverter:"builtin"`, `expandStrokes:false`; `normalizeSettings` with junk;
   overrides parse both; **fingerprint identity**: fingerprint of defaults is byte-identical to the current value (pin the current hex);
   `expandStrokes:true` changes it, `epsConverter:"inkscape"` does NOT.
3. `tests/upload_export.test.ts` — `planStages`: record `tools.eps.converter:"builtin"` + input `inkscape` → stages `[eps, validate, commit]`,
   `rebuild {svg:false, jpg:false, eps:true}`; old record without `converter` parses as `builtin`; `tools.expand` tolerant.
4. `tests/upload_runexport.test.ts` — a run with `epsConverter:"builtin"` records `tools.eps.converter/writer`; with `expandStrokes:false` records `tools.expand {enabled:false, shapes:0}`.
5. `tests/upload_settings_ui.test.tsx` (or the existing dialog test) — `upload-set-eps-converter` lists two options with the registry labels,
   changing it updates the defaults live and the row line shows `inkscape`; `upload-set-expand` toggles; the helper row appears only for `inkscape`;
   icon scope pins both with the overridden marker.
6. Implement A; docs: SOR settings table + export record schema, UI_SELECTORS rows.

### B — Inkscape helper + converter

7. `tests/helpers/fakeinkscape.mjs` — a node script that understands `--version` (prints `Inkscape 1.3.2 (fake)`) and
   `in.svg --export-type=eps --export-filename=out.eps …` (writes a minimal valid EPS whose `%%BoundingBox` is derived from the SVG's width/height;
   `--fail` env makes it exit 1; `--slow` makes it hang for the timeout test).
8. `tests/bridge_inkscape.test.ts` (`// @vitest-environment node`) — spawns the REAL `tools/bridge/server.mjs` on an ephemeral port with
   `INKSCAPE_PATH` = the fake: `/health` reports found+version; `/convert/eps` returns EPS passing `verifyEps`; missing binary → `health.found:false` with `fix`;
   child exit 1 → `502 {reason}`; hang → `504` within the (test-shortened) timeout and the temp dir is gone; body > limit → `413`;
   CORS preflight from `Origin: null` and `http://localhost:5173` allowed, `https://evil.example` refused; `/` serves `dist/index.html` when present (404 otherwise, honest).
9. `tests/upload_epsconv_inkscape.test.ts` — the browser client against a fake `fetch`: probe ok/not-reachable/not-found map to `ConverterState` with the fix text;
   convert returns `ok` + `writer:"inkscape-cli@1.3.2"`; a 5xx → `{ok:false, reason}`; abort propagates.
10. `tests/upload_runexport.test.ts` — `epsConverter:"inkscape"` with `deps.bridge` pointing at a fake converter: success commits the EPS and records the writer;
    unreachable → `partial` with the fix text in `error.detail`; the SVG/JPEG are committed either way.
11. `tests/upload_ui.test.tsx` — pre-batch probe toast line; `upload-eps-helper-check` updates `upload-eps-helper-state` live.
12. Implement B (helper first, then the client, then the stage wiring); `.bat` files; docs: README "Inkscape EPS converter (optional)",
    SOR EPS bullet, UI_SELECTORS, RULE 20 note in SOR (loopback helper, no content logs).

### C — Expand strokes to fills

13. `tests/upload_expand_geom.test.ts` — pinned outlines: horizontal line (0,0)→(10,0), width 2, butt → `M0 -1L10 -1L10 1L0 1Z`;
    square cap → extended by 1; round cap → two cubics per end; a right-angle polyline with miter → the miter point `(11,−1)`-style exact coordinates,
    with `stroke-miterlimit:1` → bevel; round join → one ≤ 90° arc; a closed square stroke → TWO subpaths, shoelace area = outer − inner exactly;
    a circle (four cubics) stroked width 2 → area within 0.1 % of π((r+1)²−(r−1)²) and every sampled boundary point at distance 1 ± 0.01 from the centre line;
    an S-curve offset → sampled offset error ≤ 0.01; a zero-length subpath → dot / square / nothing by cap.
13b. `tests/upload_expand_dash.test.ts` — arc length of a line and of a quarter circle (≈ πr/2 within 1e-4); `splitAt` returns two cubics
    whose end/start meet and whose lengths add up; pattern `[4 2]` on a 10-long line → pieces `[0,4]`,`[6,10]`; odd `[3]` → `[3 3]`;
    `dashoffset` shifts the phase; all-zero → solid; negative → refused by name; a closed dashed square opens at its phase and every piece
    is capped (round cap → two cubics on each piece); a dashed stroke's expanded area = Σ piece lengths × width (butt caps) within 0.1 %.
14. `tests/upload_expand.test.ts` (the DOM pass, real `prepareExportSvg`) — `expandStrokes:true` → no `stroke`, `stroke-width`, `stroke-linecap/-linejoin` anywhere;
    the new `<path>` has `fill` = the former stroke paint and sits right after its original; `fill="none"` originals are gone; a filled+stroked rect keeps its fill shape;
    `stroke-opacity` → `fill-opacity`; dash → `unsupported: a dashed stroke under Expand strokes`; `url(#g)` stroke → refused by name;
    `PrepareResult.strokesExpanded` counts; `strokePx` setting = the width that was expanded; `expandStrokes:false` → byte-identical output to today (equivalence gate).
15. `tests/upload_runexport.test.ts` — an expanded export: the SVG has no strokes, the EPS has no `setlinewidth`/`stroke` operator, the JPEG renders;
    `tools.expand {enabled:true, shapes:N}`.
16. Implement C (pen → offset → joins → assemble → DOM pass → prepare wiring); docs: SOR prepare bullet, settings table, row line.

### Final (every commit, and once more at the end)

* `npm run verify` (6 lanes) green; RULE 16.7 checklist walked; RULE 18 re-check of every new file against the ideals above
  (any file over 300 or function over 30 gets split by concept, never `part2`); QUALITY_RECHECK entry per commit; `git fetch` → push.

## 6. Risks and how the design meets them

| Risk | Mitigation |
|---|---|
| Chrome blocks `file://` → `http://127.0.0.1` (Private Network Access) | Helper answers the PNA preflight; AND `run_app_inkscape.bat` serves the app from the helper's origin — no cross-origin request at all |
| Inkscape output differs across versions (PS level, bounding box) | `verifyEps` gate + the writer string records the exact version in `export.json` (RULE 22) |
| Inkscape start-up cost (1–3 s per file) | sequential batch already; `--shell` mode noted as a follow-up behind the same interface |
| Expanded files are larger / more anchors | curves stay cubics (no faceting); SVGO still runs; size is recorded in `tools.svgo` as today |
| Inner-corner overlaps in built-in expansion | documented; nonzero fill renders exactly; Inkscape-side union is Q3 |
| A mass "stale" after upgrading | fingerprint appends only non-default values; converter is outside the fingerprint |

## 7. Open questions — please confirm before coding

* **Q1 — Helper process acceptable?** Inkscape can only run outside the browser. The design adds a local Node helper
  (`run_inkscape_bridge.bat`) on 127.0.0.1. Alternative: none that keeps "no manual step per file".
* **Q2 — Drop list entries for v1**: `Built-in (PostScript subset)` and `Inkscape CLI (local helper)` — two real converters
  behind a registry that takes more. Anything else you want listed (e.g. a Ghostscript-based one)?
* **Q3 — Expansion engine**: v1 expands strokes with the **built-in geometry** for every converter (deterministic, offline).
  Optional phase 2: when `inkscape` is chosen, let the helper do `object-stroke-to-path` (true boolean union, no inner overlaps)
  via `/expand/svg`. Ship v1 first, or require phase 2 in the same delivery?
* **Q4 — Dashed strokes under expansion**: refuse by name in v1 (phase 2 splits dashes), or must dashes expand in v1?
* **Q5 — Inkscape version on your machine** (`inkscape --version`), and is it on `PATH` or in `C:\Program Files\Inkscape\bin\`?
  The discovery order covers both; knowing the version pins the fake used in tests.

### Answers (2026-10-09)

| Q | Answer | Effect on the plan |
|---|---|---|
| Q1 | local helper: yes | D2 as written; `run_inkscape_bridge.bat` + `run_app_inkscape.bat` |
| Q2 | (not asked separately) two entries in v1 | registry takes more; no third converter now |
| Q3 | built-in geometry in v1 | `/expand/svg` stays phase 2; D4 unchanged |
| Q4 | dashes MUST expand in v1 | `arclen.ts` + `dash.ts` added to C; step 13b added; the dash refusal is gone (only negative values / sub-TOL periods refuse) |
| Q5 | Inkscape not installed yet | the drop list's `inkscape` entry must read "helper running, Inkscape not found — install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH" as a normal state (RULE 4: empty ≠ broken); README gets an install paragraph; the test fake pins **1.3.2** (current stable) |
