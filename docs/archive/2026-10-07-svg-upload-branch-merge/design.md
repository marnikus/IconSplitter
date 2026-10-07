# Merging the three "SVG to upload" branches (2026-10-07)

The pinned research report (`merge-report.md`, extracted verbatim from the HTML
in `design temp/SVG tab generation/tab review merging report/`) reviewed three
branches of this repository and answered one question: **which parts of which
branch become the feature, and what must be repaired first.**

It reviewed these immutable heads:

| Branch | Reviewed head | Fetched head today | Role in the report |
|---|---|---|---|
| `arena/d658a5b8-iconsplitter` | `a3d608a4` | `a3d608a4` (unchanged) | export-engine base |
| `arena/140ece1a-iconsplitter` | `25ff58aa` | `25ff58aa` (unchanged) | workflow/settings donor |
| `arena/01a0f966-iconsplitter` | `18ed0e96` | `ae9c825` (= this branch's start) | recovery/metadata/artifact donor |
| shared ancestor | `e94ade36` | `e94ade36` | — |

Its verdict: **do not merge any of the three unchanged**; keep one engine, port
the other two's good parts through explicit adapters, and repair the release
blockers before adding controls (§10).

## 1. Decision — and the one deliberate deviation

The report recommends `d658a5b8`'s export-stage architecture as the base. This
integration keeps the engine the repository already carries (the `01a0f966`
lineage, `src/svgupload/` + `src/lib/svgupload/`) and ports the donor
*capabilities* into it. Reasons, in the report's own terms:

* §6 "Do not blindly cherry-pick head commits … Port one bounded feature through
  explicit DTO adapters … Make new, reviewable commits for each port and its
  regression tests" — that method is used here; a whole-tree swap is not.
* The donors' advantages are **portable**: the local EPS writer, the appearance
  gate and the preferred-approved source rule don't require the host to be the
  base branch. The host already carries the reviewed recovery, durable metadata
  and artifact-review features the report ranked highest in `01a0f966`.
* The base's own blockers (R02–R09) are repairable in place, and the host's scan/
  row/settings/undo machinery is the part with the most tests in this tree.
* A tree containing three competing engines would violate RULE 16.4 (dead code)
  and RULE 10 (one control per decision) before it produced any working feature.

**What this costs, stated honestly:** the export engine keeps the host's module
names and DTOs (`src/svgupload/*`, `src/lib/svgupload/*`) instead of
`src/upload/*` + `lib/up*`; the base's `job.ts`/`useUpload.ts` orchestration is
not imported. The report's §8 acceptance matrix therefore applies to *behaviour*,
not to file layout.

## 2. What "merged" means for each donor

| Donor | What is taken | Where it landed |
|---|---|---|
| Report §4.15 (R18) + `d658a5b8.chooseVersion` | preferred **and** review-approved version rule | `lib/svgfile.ts` `chosenApprovedVersion`, `lib/svgupload/rows.ts` |
| Report §4.17 (R20/R21) | required output failure stops before publication; Partial only for optional EPS | `src/svgupload/runstep.ts` (`produce()`, `validate()`, fail-closed `publish()`) |
| Report §4.18 (R22) | one cancellable owner for paid metadata runs; cancel checked at the publication boundary | `src/svgupload/jobsteps.ts`, `jobactions.ts`, `runstep.ts`, `exporter.ts` (`ExportIo.signal`) |
| Report §4.1 (R01) | publication rollback + an interrupted publication is never read as Processed | `src/svgupload/package.ts` (`.export-backup`, `readPackage().incomplete`), `src/svgupload/usescan.ts` |
| Report §4.16 (R19) | select-all acts on the **visible** rows and never drops a hidden choice | `lib/svgupload/view.ts` (`checkableIds`, `toggleSelection`) |
| Report §3.1 | the FULL SVGO preset runs behind a 256x256 appearance comparison; a refusal writes the unoptimised copy, and with no renderer only the two plugins that cannot change a pixel run | `lib/svgupload/optimize.ts` (`deliveryConfig`, `rendersMatch`, `structuralIssues`, `COMPARE`), `src/svgupload/optimizer.ts` (`mode`), `src/svgupload/raster.ts` (`renderPixels`) |
| Report §4.2/§4.3 (R02/R03) | the source's identity is the SHA-256 of its BYTES, so an edit that keeps the path, the size and the mtime still stales the package and the metadata | `lib/svgupload/sourcehash.ts` (`sha256Hex`), `src/svgupload/scanhash.ts` (`attachSourceHashes`), wired in `usescan.scanRows` |
| Report §5 P0 / R12 (metadata-only edit) | an edited accepted answer re-stamps the PUBLISHED SVG and JPEG without re-rendering, without a provider request and without losing a kept EPS | `lib/svgupload/states.ts` (`reembed`), `src/svgupload/reembed.ts`, `runstep.reembed()`, `exporter.ts` (`publishedJpeg`) |
| Report §3 "one shared geometry model" | the reviewed geometry engine (transforms, arcs, the minimal CSS cascade, stroke-aware visible bounds with the miter limit) ported as `lib/svgupload/geom/*`; the scene carries the `vector-effect: non-scaling-stroke` exemption | `lib/svgupload/geom/{matrix,arc,path,color,css,bounds,scene}.ts`, `tests/svgup_geom.test.ts` (12) |
| Report §3.2 (local EPS) | a genuine local EPSF-3.0 writer for the icon subset: the page is the ARTBOARD at 96 dpi, so 2.2 pt prints as `2.2 setlinewidth`; the converter is only the fallback and is asked with the artboard's REAL size (fixes S60's zero-size request) | `lib/svgupload/epswrite.ts`, `src/svgupload/epsio.ts`, `runstep.convertEps()`, `tests/svgup_epswrite.test.ts` (14), `tests/svgup_epsio.test.ts` (6) |

Already true on the host, checked against the report rather than assumed: the
IPTC `ObjectName` is dataset 2:5 (`jpegseg.ts`); the JPEG readback compares the
FIELD VALUES, not the packet's presence (`verifyMetadata`); the record's JPEG
hash and byte count come from the bytes that were actually written, embedded
metadata included (`exportrecord.outputRecords` of `this.jpeg`); the host never
bakes and then drops a stylesheet — `prepare` builds a new document from the
source's own content, so a class-styled source keeps its rules (R04's failure
mode does not exist here).

Not yet ported (kept as the next steps, with the report's priority): the
ink-versus-canvas geometry decision behind "never copy viewBox-as-visible-bounds"
(the engine is in place; `prepare.planExport` still fits the document canvas, and
the padding basis and the physical-stroke contract must be decided with it — §9),
one schema identity with migrations and an icon-scoped package folder
(§4.19/R24), and the preview lifecycle (R23: cache by
root/generation/hash, revoke replaced URLs).

## 3. Release-blocker status after this step

| # | Blocker (report §4) | State |
|---|---|---|
| R01 | publication is not package-atomic | **repaired** — backup + rollback, record written last, `incomplete` detected and refused |
| R18 | preferred usable is not review-approved | **repaired** — approved-only choice with a stated fallback |
| R19 | select all is a no-op | **repaired** — visible/eligible scope, hidden selections kept |
| R20/R21 | selective runs lose retained outputs; publish after a required failure | **repaired** — required failure returns before the publish step; optional EPS stays Partial |
| R22 | cancellation does not cover metadata-only naming or the pre-publication boundary | **repaired** — naming has its own controller, the run checks its signal before writing |
| R02/R03 | identity by file path/stat instead of content; metadata identity | **repaired here** — the chosen source is identified by the SHA-256 of its bytes; the same value is the metadata's and the record's source identity, so an in-place edit stales both (a UI test proves it with a same-size, same-mtime edit) |
| R04/R05/R06/R08 | style baking, IPTC dataset, field-level readback, final-byte statistics | verified NOT present in this host — see the note above; the remaining piece is recording the encoder's MEASURED dimensions instead of the requested ones (currently a warning only) |
| R07/R09 | planner/stroke dependency mismatch, per-icon exception isolation | **half done** — the geometry engine that measures ink bounds and stroke extents is ported (`lib/svgupload/geom/*`) and the stroke override is applied per the copy's own rule, but `planExport` still fits the document canvas, so the planner-side wiring and a thrown dependency error's per-icon conversion are still open |
| R10–R17 | workflow-donor defects (credential/scan ref alias, retained outputs, readback gate, EPS fill/stroke) | not applicable to this host except the EPS/readback ideas: the local EPS writer covers the fill/stroke/even-odd/dash cases the donor's parser was missing; selective-run retained outputs are covered by the metadata-only re-stamp |
| R23 | preview lifecycle (object-URL revocation, cache keys) | partially: the JPEG cache is keyed by root already; revocation on replacement is open |
| R24 | schema and folder identity | open (one `export.json` per pair folder is the host's rule; the two-pairs-one-folder case still needs a preflight) |
| R25 | exclude the unrelated Arena capture | not carried into the tree |

## 4. Evidence for this step

* Tests first, at the existing seams: `tests/svgup_job.test.ts` (+6),
  `tests/svgup_package.test.ts` (+3 and the reader's shape),
  `tests/svgup_rows.test.ts` (+5), `tests/svgup_view.test.ts` (+4),
  `tests/svgup_ui_jobs.test.tsx` (+2). Each new test fails against the previous
  code (the R20/R21 and R22 cases were run red before the fix: `partial` where
  `failed` was required, `processed` where `cancelled` was required).
* Whole suite after the first two steps: **118 files / 1274 tests green** (was
  1236 at the start of the session); `tsc --noEmit` clean; `npm run lint`
  0 errors / 8 pre-existing warnings; `node tools/quality.mjs --changed
  --allow-legacy` green; `npm run coverage` green with `src/lib/svgupload` at
  93.7 % lines (`sourcehash.ts` 100 %, `optimize.ts` 100 %).
* The metadata-only re-stamp, the geometry port and the local EPS writer were
  then added under the same gates: **121 files / 1312 tests green**;
  `npm run lint` 0 errors / 8 warnings; `node tools/quality.mjs --changed
  --allow-legacy` GATE PASSED (it failed first: `runstep.ts` and `geom/scene.ts`
  were over the 300-line hard limit for new files, which is why the EPS stage
  moved to `epsstage.ts` and the record building to `runrecord.ts`);
  `npm run coverage` exit 0 with `src/lib/svgupload` at 96.75 % lines
  (`epswrite.ts` 98.4 %, `geom/*` 88.4 %); `npm run build` exit 0.
  The re-stamp tests were run red first: the edited tag did not reach the
  published files and the reuse path recorded no metadata provenance.
* Step 2's own red runs: the content-hash UI test failed against the stat
  fingerprint (the row read `accepted` while the file had changed), and the
  appearance-gate tests failed while `optimizeSvg` was still synchronous. The
  fixtures that had encoded `size:mtime` (`svgup_ui_jobs`) were updated to the
  content identity — that is the report's expected consequence, not a weakened
  assertion.
* The report's own §8 rows exercised so far: "Declined preferred SVG…"
  (approved-only choice), "In-place SVG content edit with same path/size/mtime"
  (SHA-256 of the bytes; UI test), "Filtered selection and bulk apply…",
  "Required JPEG encode/decode failure…", "Failure at every publication write
  position…", "Cancel during…before commit", and the optimizer's own
  appearance-budget cases: a pixel match is kept, a pixel difference is refused,
  and with no renderer only the pixel-safe plugins run.

## 5. How to continue

1. Finish the report's Phase 1: wire the ported geometry into the planner (the
   ink-versus-canvas fit, R07), per-icon exception isolation (R09) and the
   measured-dimensions record fix.
2. Decide the remaining §9 unit questions (the padding percentage's basis and
   the physical-stroke contract at final raster resolution) on top of the EPS
   page arithmetic that is now fixed at artboard-at-96 dpi.
3. Then the report's Phase 2 (one schema identity, migrations, icon-scoped
   package folders) and Phase 3 (a durable journal for the whole job).
4. Re-run the report's §8 acceptance matrix against the integrated build before
   claiming any row passes; the rows exercised so far are listed in §4.

Doc rules: this file is dated history and is not edited afterwards; the
behaviour that is true today is in `docs/current/SYSTEM_OF_RECORD.md` §20.
