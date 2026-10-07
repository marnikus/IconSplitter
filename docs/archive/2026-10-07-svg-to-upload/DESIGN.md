# SVG to upload — design, ownership and phased plan

Date: 2026-10-07 · Owner modules as named below · Status: implemented phases 1–8
(this doc is the contract; results and open limitations are in `RESULTS.md`).

## 1. What this tab is

A third stage that turns an **approved SVG produced by the Generate SVG tab**
into an upload package: an optimised SVG, a 15.1 MP JPEG rendered from the
vectors (not an upscaled thumbnail), optional genuine EPS, conceptual metadata
from Gemini, and one `export.json` per icon. It never uploads anywhere.

## 2. Existing modules this is built on (researched, not assumed)

| Need | Existing owner | How SVG-to-upload uses it |
|---|---|---|
| Approved pairs, recursive scan, pair files | `src/svg/sources.ts` (`discoverApprovedSources`), `src/lib/pairmeta.ts`, `src/lib/pairing.ts` | the tab re-runs the same discovery, so "approved" has ONE definition |
| Version history + the chosen version (I-54) | `src/lib/svgfile.ts` (`chosenVersion`), `src/svg/rowmodel.ts` | a row's source SVG is `chosenVersion(versions, preferred)` — the same version the Generate SVG tab shows |
| Safe SVG reading, fitting, sanitising | `src/lib/svgpreview.ts`, `src/lib/svgvalidate.ts` | the preview of an export row reuses `buildSvgPreview` |
| File System Access adapter (atomic-ish writes) | `src/lib/fs.ts` (`ensureDirPath`, `writeFileNew`, `writeFileOverwrite`, `tryGetFile`) | the `export/` folder is created and written through it; the last valid package is never overwritten in place |
| Root handle restore | `src/svg/scan.ts` (`bootSources`), `src/batch/store.ts` | the tab remembers its own root, falls back to Selection/SVG handles |
| Secret storage | `src/svg/keystore.ts` (IndexedDB `secrets`), `src/lib/svgsecret.ts` (`maskKey`/`redact`) | a second key slot for the Gemini key; same mask/redact rules, never in Git/logs/exports |
| Global undo/redo | `src/state/historystore.ts` + `src/state/apply.ts` (`ENTRY_TYPES`) | bulk settings/metadata edits become ONE undoable entry |
| Session restore | `src/lib/session.ts` + `src/state/appstore.ts` | `upload` slice: checked ids, active id, filter, sort, zoom |
| Progress/log surfaces | `src/lib/log.ts`, `src/log/logstore.ts` | every stage reports; the dock stays the single activity surface |
| Provider HTTP shape | `src/lib/svgrequest.ts` (SSE/JSON, abort, usage) | the Gemini client follows the same rules: abort, timeout, retries, usage, redaction |

**Deliberately NOT reused:** the Run/batch queue of Generate SVG (this tab has no
paid batches of images), the `_AI.svg` version naming (an export is not a
generation attempt and must not appear in the version history).

## 3. Ownership map (one writer per value)

```
pair folder/                      ← existing, never written by this tab
  <ref>.png  <base>_AI<suffix>.png
  <base>_AI<suffix>.svg  _v2.svg  ← approved SVG history (unchanged by export)
  <base>_AI<suffix>.svg.json      ← pair file (decision, versions, preferred)
  export/                         ← owned by SVG-to-upload
    <base>.svg  <base>.jpg  [<base>.eps]  export.json
```

| Value | Single writer | Stored where |
|---|---|---|
| Global defaults | `src/upload/settingsstore.ts` | localStorage `iconSplitter.upload.settings.v1` |
| Per-icon overrides | `src/upload/settingsstore.ts` | same payload, keyed by pair id |
| Accepted metadata | `src/upload/metastore.ts` + `export.json` mirror | localStorage + the icon's own `export.json` |
| Provider config + key | `src/upload/providerstore.ts`, key in IndexedDB `secrets` | never in the pair file |
| Export package | `src/upload/publish.ts` via `src/lib/fs.ts` | `<pair>/export/`, staged then published |
| Job state | derived (`src/lib/uploadstage.ts`), never stored as a second truth | recomputed from `export.json` + fingerprints |

## 4. Decisions taken before code (conflicts resolved)

1. **Tag count: 40, everywhere.** The brief's "50" contradicts its own prompt,
   template and example. 40 is the single rule in `uploadmeta.ts`; the UI, the
   prompt text and the validator all read that one constant.
2. **The title rule is two sentences, validated separately.** Sentence 1: 5–7
   words. Sentence 2: 3–5 words. The brief's example ("The Vector Icon of …")
   is 6 words in its fixed part alone, so the validator counts words and the
   prompt asks for the *pattern* (name the two tags), never for that exact
   phrase — no claim is made that a fixed over-long phrase meets the limit.
3. **Metadata is a draft, not legal clearance.** The prompt forbids brands,
   names and style references and the parser *warns* on restricted patterns; the
   UI labels warnings as "review required". Nothing claims IP clearance.
4. **pt is a physical unit.** 2.2 pt = 2.2/72 in; at the documented 300 DPI
   export that is 9.166… px of the JPEG. `uploadunits.ts` owns the conversion;
   the SVG copy applies the same width in artboard user units, so the printed
   and the raster width agree.
5. **EPS is genuine PostScript, emitted from the vectors.** CairoSVG cannot be
   used in a browser and there is no PDF/PS toolchain in the app, so
   `epssvg.ts` writes an EPSF-3.0 program itself (`%!PS-Adobe-3.0 EPSF-3.0`,
   `%%BoundingBox`, path/fill/stroke operators). A renamed PDF/PS is never
   produced. Constructs it cannot express (gradients, filters, text, embedded
   rasters) are reported as limitations, the icon's status becomes **Partial**,
   and SVG+JPEG remain complete — exactly the brief's failure policy.
6. **Optimisation is real SVGO** (`svgo@4` `svgo/browser`), pinned config in
   `svgoptimize.ts`, with a geometry/metadata equivalence check afterwards; a
   failing optimiser leaves the unoptimised copy and says so — it never blocks
   the package.
7. **15.1 MP is a target, not a promise to distort.** Width/height are integers
   chosen by one scale factor per icon; the achieved MP is displayed next to the
   target and recorded in `export.json`.
8. **The artboard is square by default** (square icons), and preserves the
   artwork's aspect ratio otherwise — never stretched, never cropped.
9. **`export/` is excluded from discovery**, so an export can never be approved
   as a source or fed back into the pipeline (no export loop).
10. **The source history is read-only.** Every transformation happens on a copy
    held in memory; nothing under the pair folder outside `export/` is written.

## 5. Module layout

| Module | Responsibility |
|---|---|
| `src/lib/uploadsettings.ts` | settings shape, defaults, clamps, validation messages |
| `src/lib/uploadoverride.ts` | per-icon overrides, effective settings, reset, bulk apply |
| `src/lib/uploadunits.ts` | px/pt/mm/in ↔ px at a documented DPI |
| `src/lib/svgtransform.ts` | SVG transform list → 2×3 matrix (compose/apply) |
| `src/lib/svggeom.ts` | shape + path-data bounds (line/curve/arc extrema), stroke expansion |
| `src/lib/uploadbounds.ts` | document walk: visible bounds incl. transforms and strokes |
| `src/lib/uploadartboard.ts` | padded artboard, prepared export SVG copy, JPEG pixel size |
| `src/lib/uploadmeta.ts` | metadata record, word counting, 40-tag/required-term validation, restricted-content warnings |
| `src/lib/uploadprompt.ts` | default prompt, final prompt, redacted request preview |
| `src/lib/geminiconfig.ts` | verified endpoint/model, timeout/retries/concurrency, cost estimate labelling |
| `src/lib/geminirequest.ts` | request body (inline image + prompt + JSON schema) |
| `src/lib/geminiparse.ts` | response → metadata, refusal/truncation/error classification |
| `src/lib/geminiclient.ts` | fetch with timeout, bounded retries, one in-flight request per icon |
| `src/lib/svgmeta.ts` | `<title>/<desc>/<metadata>` embed + read-back |
| `src/lib/jpegmeta.ts` | APP1 XMP + APP13 IPTC write, read-back, SOF dimension decode |
| `src/lib/svgoptimize.ts` | SVGO run + equivalence evidence |
| `src/lib/epssvg.ts` | SVG → EPSF-3.0 PostScript, EPS verification |
| `src/lib/uploadrecord.ts` | `export.json` schema, tolerant parse, serialise |
| `src/lib/uploadplan.ts` | fingerprints + selective re-export plan (per stage) |
| `src/lib/uploadstage.ts` | job states, stage order, status derivation |
| `src/upload/*` | panel, rows, controls, stores, the run orchestrator |

## 6. Delivery order of one icon (dependency order is real)

`Discovered → Preflight → Prepare → Metadata → Render → Optimize → Embed → EPS
→ Validate → Commit → Processed`

Metadata is read **before** rendering, because the JPEG is written *with* its
metadata in one pass (one re-encode, no second lossy pass) and the optimiser must
not be allowed to strip a title that was embedded after it. The optimiser runs
before embedding, and the embedded result is verified by reading the bytes back.

## 7. Failure policy

| Failure | Result |
|---|---|
| No API key / auth rejected | metadata stage blocked, export blocked (metadata is required), key state kept independently of the model check |
| Provider timeout / rate limit | item **Failed** with the classified reason; retry is explicit, never automatic double-spend |
| Truncated/malformed/refused answer | item **Failed**, no file written for that icon |
| Optimiser failure | warning; unoptimised SVG shipped, flagged in the record |
| EPS requested but impossible | item **Partial** (SVG+JPEG complete), reason recorded |
| Disk/write failure mid-package | staging discarded, last valid package preserved, item **Failed** |
| Source SVG changed since the record | item **Stale** until re-exported |

## 8. Test plan (RULE 8 — the real modules under test)

Characterisation first at the existing seams (`svg/sources`, `lib/fs`), then
per-module unit suites: geometry against hand-computed boxes; 15.1 MP sizing;
`pt` conversion; metadata validation against the brief's own examples; provider
transport with fake fetch (timeout, 429, truncation, refusal, malformed);
JPEG XMP/IPTC byte round-trip; SVG embed/read-back; SVGO equivalence; EPS header
and BoundingBox; export record round-trip and partial success; plan reuse
(no stage reruns when nothing changed); panel tests for selection/status rules.

## 9. Out of scope (stated, not hidden)

Website uploading, image *generation* (Gemini returns words, not pictures),
PDF/EPS via external binaries, and any write outside `<pair>/export/`.
