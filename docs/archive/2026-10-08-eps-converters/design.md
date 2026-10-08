# EPS converters + Inkscape CLI framework (2026-10-08)

Doc first (RULE 16.6 / RULE 17). No production code in this change.
Behaviour below is **proposed**; `docs/current/SYSTEM_OF_RECORD.md` stays
what is true today until the TDD steps land.

## 1. The problem

SVG to upload writes EPS with one in-process writer (`writeEps`,
`tools.eps.writer = "builtin-subset-1"`). That writer is a **documented
SVG subset** → EPS 10. Anything outside the subset fails the stage
honestly (`partial`). Users who want a full SVG→EPS (filters, extra
paints, Inkscape's own Cairo EPS) have no other path, and no control
that chooses one.

Ask:

1. A **drop list** of EPS converters (more than one, one control).
2. A new **Inkscape CLI framework** that also exports the (optimized)
   export SVG to EPS.

## 2. Constraints (measured, not guessed)

* The app is a **browser SPA** (`dist/index.html`, File System Access).
  A page cannot spawn `inkscape`. Raster already solves this class of
  problem with an injected port (`RasterDeps`). EPS must do the same.
* RULE 20: image bytes never leave the machine except the existing
  opt-in Gemini metadata call. A remote “convert my SVG” service is
  out. A **loopback helper on 127.0.0.1** is on-device, optional, and
  the same class as “the user runs a local tool”.
* RULE 10: `includeEps` already means *whether* to write EPS. The
  converter is a second decision: *how*. One checkbox + one select,
  not two checkboxes that both mean “write EPS”.
* RULE 9: a converter that cannot run must not stall SVG/JPEG. Same
  as today: EPS failure → `partial`, other artifacts stay.
* RULE 4: unavailable ≠ broken. Inkscape missing is an honest status
  on the select, not a red package on every row that never asked for it.
* RULE 8: tests run the real catalog, argv builder, dispatcher and
  verifier. `child_process` is a seam (fake host), never mocked
  `convertSvgToEps` in UI tests.
* RULE 15: nothing ships without verification. Inkscape's Cairo EPS
  is **not** our EPS 10 document, so the verifier must take a
  **profile** (see D6).
* RULE 16 / 18: `eps.ts` is 292 lines (hard file cap 300). The new
  work is a **new module**, not more lines on the walker.
  `settings.ts` is 248 — add one field, do not grow past 300.

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Converter registry.** `ConverterId = "builtin" \| "inkscape"`. One catalog the dropdown, the settings parser and the dispatcher all read. A third converter later is one catalog row + one module — no stubs now. | RULE 3/10. “Several” is the list, not placeholder options that do nothing. |
| D2 | **Setting `epsConverter`.** On `UploadSettings`, default `"builtin"`. In `SETTINGS_FIELDS` and the fingerprint. Unknown / missing → `"builtin"` (RULE 13). Stored even when `includeEps` is off, so the choice survives a toggle. | Same persistence class as `includeEps`. |
| D3 | **UI: checkbox then select.** `upload-set-eps` stays “Also write EPS”. New `upload-set-eps-converter` (`<select>`, `aria-label="EPS converter"`) lists catalog labels. Disabled while `includeEps` is off (hint says why). Live (RULE 24). Per-icon override + marker like every other field. | One control per decision. |
| D4 | **Inkscape is a CLI framework, not a spawn inside React.** Pure: version parse, argv for Inkscape 1.x vs 0.92, job (SVG text in → EPS text out), stderr→reason map. Run goes through `CliHost` (probe + `runInkscape`). | Browser cannot spawn; tests must not need Inkscape installed. |
| D5 | **Production host = loopback helper, optional.** `tools/inkscape-host.mjs` binds **127.0.0.1 only** (default port 7788). `GET /health`, `POST /eps` `{ svg, title }` → `{ ok, eps, version }` or `{ ok: false, reason }`. Browser `CliHost` `fetch`es that origin with a short probe timeout (~500 ms). Down or no Inkscape on PATH → converter **unavailable**, builtin still works. Bytes never leave the machine. No extra URL setting (RULE 10). | The only honest way a Chrome tab runs Inkscape. |
| D6 | **Verify by profile.** `builtin` → today's EPS 10 markers (`verifyEps`). `inkscape` → **generic** EPS: `%!PS-Adobe-` + `EPSF` header, `%%BoundingBox`, `%%EOF`, non-empty body (`verifyEpsDocument(eps, "generic")`). A Cairo EPS that fails generic → `partial`, never shipped. | RULE 15 without forcing Inkscape to impersonate our DSC block. |
| D7 | **No silent fallback.** User chose `inkscape` and the host is down → EPS stage fails with that reason, `tools.eps.writer` still records `inkscape-cli`, SVG/JPEG commit. Never write a builtin EPS under the Inkscape name. | RULE 4/22. |
| D8 | **Same input as today.** Converter always consumes the **cleaned/optimized export SVG** (four-point batch, point 2). Inkscape does not re-prepare. `fixes` for Inkscape is empty (or a single informational `Inkscape <version>` line only if we can say something the writer *changed* — version alone is `tools.eps` metadata, not a `fixes` row). | Do not fork the pipeline. |
| D9 | **Record.** `tools.eps.writer` is the catalog `writer` string (`builtin-subset-1` / `inkscape-cli`). Additive `tools.eps.engine?: string` (Inkscape version) — absent on builtin / old records = none. Schema `v` stays 1. | Traceable (RULE 22); old `export.json` still parses. |
| D10 | **Abort.** `CliHost.runInkscape` takes the run `AbortSignal`. Cancel mid-Inkscape is interruption, not failure (RULE 7). Helper kills the child. | Same as metadata/export cancel. |

Rejected: remote convert APIs (RULE 20); listing Ghostscript/rsvg with no module (dead options); putting argv/spawn in `exportstages.ts`; hiding the select when EPS is off (the setting would have no visible home); using `settingsFingerprint` *and* a special planner delta — the fingerprint already rebuilds on any settings change, same as toggling `includeEps` today. Accept the extra JPEG rebuild; do not invent a second fingerprint.

## 4. Module map (RULE 18 — write for the reader)

New directory `src/lib/upload/epsconvert/` — one responsibility: **which
converter, and how Inkscape is invoked**. Cohesion: these files change
together; `geom/` and `eps.ts` (the subset walker) do not.

| File | Owns | Ideal lines | Hard |
|---|---|---:|---:|
| `types.ts` | `ConverterId`, `ConvertRequest`/`Result`, `CliHost`, `ProbeResult`, `InkscapeJob` | 40–70 | 120 |
| `catalog.ts` | the list the dropdown reads: `id`, `writer`, `label`, `hint`, `needsHost`, `verifyProfile` | 30–50 | 80 |
| `id.ts` | `readConverter(unknown) → ConverterId` (RULE 13) | 8–15 | 30 |
| `convert.ts` | `convertSvgToEps(id, req, host)` dispatcher | 15–25 | 40 |
| `inkscapeargv.ts` | `parseInkscapeVersion`, `inkscapeArgv(version, paths)` — 1.x vs 0.92 | 40–70 | 100 |
| `inkscape.ts` | framework: probe copy, `convertWithInkscape(req, host)`, reason map | 40–80 | 120 |
| `host.ts` | `unavailableHost`; `loopbackHost(fetch)` — no spawn | 50–90 | 150 |

`tools/inkscape-host.mjs` (not `src/`, still keep ≤ 200): PATH lookup
(Windows `inkscape.com`/`inkscape.exe`, Unix `inkscape`), temp dir,
spawn, timeout, cleanup, 127.0.0.1 bind, CORS for the app origin,
never writes into the user's export folder (temp only; EPS bytes in
the HTTP body).

Callers:

* `settings.ts` — one field + `readConverter` on normalize/overrides/fingerprint.
* `exportstages.ts` `buildEps` — `await convertSvgToEps(...)`, then profile verify.
* `export.ts` `newExportRecord` — `writer` from catalog, not a literal.
* `UploadSettingsDialog` — extract `ConverterSetting` (do not grow the grid
  function past 30 lines). Handle `upload-set-eps-converter` +
  `upload-set-eps-converter-state` (probe line).
* `UploadRow` settings cell: `eps on · builtin` / `eps on · inkscape`.
* `StageContext` gains `cli?: CliHost` (default `loopbackHost` in the panel,
  `unavailableHost` when omitted — tests inject a fake).

Inkscape 1.x argv (framework contract):

```
inkscape --export-filename=<out.eps> --export-type=eps
         --export-area-page --export-text-to-path --export-ps-level=3
         <in.svg>
```

Inkscape 0.92:

```
inkscape --without-gui --export-eps=<out.eps>
         --export-area-page --export-text-to-path <in.svg>
```

Version from `inkscape --version` → `/Inkscape\s+(\d+)\.(\d+)/`.
Major ≥ 1 → 1.x argv. Unparseable version → honest reason, no guess.

## 5. UI copy (handles)

| Handle | Control |
|---|---|
| `upload-set-eps` | unchanged checkbox |
| `upload-set-eps-converter` | `<select>` of catalog ids |
| `upload-set-eps-converter-state` | one line: `ready · Inkscape 1.3.2` / `unavailable · Inkscape CLI is not running on this machine` / `idle` while `includeEps` is off |
| `upload-set-marker-eps-converter` | inherited / overridden (icon scope) |

Hints: builtin = “EPS 10 for the documented subset; anything else fails
that stage honestly”. inkscape = “local Inkscape via the loopback helper
(`127.0.0.1:7788`); start `node tools/inkscape-host.mjs`”. Checkbox off:
select disabled, state `idle`, hint “tick Also write EPS to choose a
converter”.

## 6. Invariants (land with the code as I-59…I-61)

* **I-59 (one converter per export, RULE 10/22):** the committed EPS was
  produced by the catalog id stored on the effective settings; 
  `tools.eps.writer` equals that id's `writer`. A builtin file never
  claims `inkscape-cli`.
* **I-60 (host optional, RULE 4/9):** no helper / no binary → Inkscape is
  *unavailable*, never *broken*. Export of SVG/JPEG proceeds. An
  Inkscape-selected EPS stage fails closed with that reason → `partial`.
* **I-61 (loopback only, RULE 20):** the browser host talks only to
  `127.0.0.1` (or the injected test double). SVG bytes are never POSTed
  to any other origin by this feature.

## 7. Size / quality gates (RULE 16 + 18) — recheck before merge

```
[ ] no new function/component > 30 lines
[ ] no new file > 300 lines (aim 150–300 per file; this module's files
    should sit in the 40–120 band — under 4 lines only for
    readConverter / catalog predicates)
[ ] params ≤ 4 (ConvertRequest / CliHost are domain types, not options: any)
[ ] CC ≤ 10, nesting ≤ 4 (argv 1.x vs 0.92 is a table, not a branch pile)
[ ] no fooPart1; no lookup-of-lambdas to hide ifs
[ ] settings.ts and eps.ts line counts must not grow past 300
[ ] UploadSettingsDialog: extract ConverterSetting rather than widen SettingsGrid
[ ] every new lib function has a test that fails if deleted
[ ] ideal-size comment only for a real locality constraint
```

`src/lib/upload/` already has many files; the **new directory** is the
cohesion boundary (RULE 18 module = 5–15 files; this one is 7).

## 8. Out of scope

* Shipping Inkscape. * Detecting a GUI install by walking `C:\Program Files`
  from the browser. * Changing the subset writer. * Remote converters.
* A user-facing helper URL field. * Rebuilding JPEG cheaper when only
  the converter changes.

## 9. TDD steps (red → green; do not skip)

Each step is one (or a tight pair of) failing tests, then the minimum
code. Run `npx vitest run tests/<file>` per step. `npm run quality:changed`
when a `src/` file appears. `npm run verify:fast` only at the end
(and before commit).

| # | Red (test that must fail if the step is deleted) | Green |
|---|---|---|
| 1 | `tests/upload_epsconvert.test.ts`: catalog has `builtin` and `inkscape`; labels; `readConverter` maps `"inkscape"` / junk / missing → ids (`junk` → `builtin`) | `epsconvert/catalog.ts`, `id.ts`, `types.ts` |
| 2 | `tests/upload_settings.test.ts`: default `epsConverter: "builtin"`; normalize junk; parseOverrides pins a valid id; fingerprint changes when the id changes; `SETTINGS_FIELDS` contains it | `settings.ts` one field |
| 3 | `tests/upload_inkscape.test.ts`: `parseInkscapeVersion("Inkscape 1.3.2 (…)")` → `{major:1,minor:3}`; `0.92.5` → 0.92; garbage → null. `inkscapeArgv` 1.x uses `--export-filename` + `--export-type=eps` + `--export-ps-level=3`; 0.92 uses `--export-eps` + `--without-gui`; both pass `--export-area-page` `--export-text-to-path` and the two paths | `inkscapeargv.ts` |
| 4 | same file: `convertSvgToEps("builtin", req, unavailableHost)` still returns today's EPS 10 (real `writeEps`). `"inkscape"` + unavailable host → `{ ok: false, reason: /not available/, writer: "inkscape-cli" }` | `convert.ts`, `host.ts` `unavailableHost`, `inkscape.ts` |
| 5 | fake host that records the job and returns a **Cairo-shaped** EPS (header + BoundingBox + EOF, no `%%DocumentData`): convert ok, `writer: "inkscape-cli"`. `verifyEps` (eps10) fails that fixture; `verifyEpsDocument(eps, "generic")` passes; empty body / missing header fail closed | `epsdoc.ts` generic profile; `inkscape.ts` convert |
| 6 | fake host returns `{ ok: false, reason: "inkscape: not found" }` → convert fails with that reason, never a builtin body | D7 |
| 7 | AbortSignal already aborted → interruption-shaped reason (not “failed”), no host run | RULE 7 |
| 8 | `tests/upload_export.test.ts`: `newExportRecord` writer follows settings converter; a record with `inkscape-cli` still `parseExportRecord`s | `export.ts` |
| 9 | `tests/upload_runexport.test.ts` (or `upload_exportstages`): `includeEps` + `inkscape` + fake host → committed `.eps` is the host body, `tools.eps.writer === "inkscape-cli"`, SVG/JPEG present. Same + unavailable host → `partial`, SVG/JPEG committed, no `.eps` (or previous kept), error names Inkscape | `exportstages.ts` async `buildEps`; thread `cli` on `StageContext` |
| 10 | `tests/upload_ui.test.tsx` / a focused settings test: dialog shows the select; options are the two labels; checkbox off → select `disabled`; choosing inkscape pins override in icon scope (`upload-set-marker-eps-converter` = overridden); row cell names the converter when EPS is on | `ConverterSetting` in the dialog |
| 11 | `tests/upload_inkscape_host.test.ts`: `loopbackHost` probe `GET /health` 200 → ready + version; connection refused → unavailable (not thrown). `POST /eps` forwards svg/title and returns body. Fetch never called for `builtin`. Wrong host (not 127.0.0.1) is refused in the host factory | `host.ts` loopback |
| 12 | `tests/inkscape_host_runner.test.ts` (tools): health payload shape; argv the helper would spawn (pure, **no real inkscape**). Optional `it.skip` live test behind `INKSCAPE_TEST=1` — never required in `verify` | `tools/inkscape-host.mjs` |
| 13 | Docs in the **same commit** (RULE 17): SOR §2 settings + EPS verify + §5 I-59…I-61 + §6/§7 module rows + §11 handles; `UI_SELECTORS.md` the three handles; `docs/README.md` this archive row; README user sentence (Inkscape helper); append one `QUALITY_RECHECK.md` entry with measured gate numbers. Do not edit this archive file to “catch up”. | — |
| 14 | `npm run quality:changed` then `npm run verify:fast`. Recheck the §7 box. Commit. `npm run verify` before push. | — |

### Step notes

* Steps 1–7 are pure lib: fast, no panel. Stay here until green.
* Do not inject Inkscape into `upload_ui` export runs unless the test
  supplies a fake host — default host in tests is `unavailableHost` so
  existing `includeEps: true` cases keep using **builtin** unless they
  set `epsConverter: "inkscape"`.
* `DEFAULT_UPLOAD_SETTINGS.epsConverter = "builtin"` keeps every
  existing `writeEps` test and every `{ ...DEFAULT, includeEps: true }`
  fixture behaviour-identical (RULE 8 equivalence).
* Helper is last on purpose: the framework is testable without it.

## 10. Implementation order after this doc

1. Do **not** start at the dialog or the helper.
2. Steps 1 → 7 (registry + framework + fake host).
3. Steps 8 → 9 (pipeline).
4. Step 10 (dropdown).
5. Steps 11 → 12 (loopback + helper).
6. Steps 13 → 14 (docs, gates, commit).

If a function crosses 20 lines, split by the names already in this
doc (`parseInkscapeVersion`, `inkscapeArgv`, `convertWithInkscape`)
before it crosses 30 (RULE 19: nesting → CC → cognitive → size last).
