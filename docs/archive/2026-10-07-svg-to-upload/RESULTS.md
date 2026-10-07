# SVG to upload — what exists, what is verified, what is left

Status date: 2026-10-07. Companion documents: `DESIGN.md` (the accepted contract),
`CAPABILITIES.md` (the researched facts and the contradictions resolved).

## 1. What this tab is

A new workspace tab, placed after **Generate SVG**, that turns approved SVGs into
per-icon export packages for external websites. It never uploads anything: the
end product is `<pair-folder>/export/<icon-base>.svg`, `.jpg`, optional `.eps`
and `export.json`, written by the user's own folder handle.

## 2. Modules built and where the rules live

| Area | Module | Rule it owns |
|---|---|---|
| Settings | `src/lib/uploadsettings.ts` | the defaults the brief names, the numeric limits, one message per bad field |
| Units | `src/lib/uploadunits.ts` | px/pt/mm/in ↔ px at an explicit DPI (2.2 pt = 9.167 px @ 300 DPI) |
| Overrides | `src/lib/uploadoverride.ts` | effective settings, inherited vs overridden, reset, one-action bulk apply with its undo payload |
| Transforms | `src/lib/svgtransform.ts` | transform lists → one matrix, nested composition, the inline-style-wins reader |
| Geometry | `src/lib/svggeom.ts` | shape boxes, exact cubic/quadratic/arc extrema, stroke allowance, box algebra |
| Bounds | `src/lib/uploadbounds.ts` | document walk: composition, `<use>`, what cannot be measured |
| Artboard | `src/lib/uploadartboard.ts` | padded board, integer pixel size, prepared export copy |
| Metadata | `src/lib/uploadmeta.ts` | 40 tags, 5–7 + 3–5 title words, 7–15 description words, restricted-content warnings |
| Prompt | `src/lib/uploadprompt.ts` | the default prompt, the JSON contract, the redacted request preview |
| Provider | `src/lib/geminiconfig.ts`, `geminirequest.ts`, `geminiparse.ts`, `geminiclient.ts` | verified model id, request body, error classification, one paid request |
| Embedding | `src/lib/svgmeta.ts`, `src/lib/jpegmeta.ts` | `<title>/<desc>` + Dublin Core; XMP + IPTC in the JPEG, read back |
| Raster | `src/lib/uploadraster.ts` | vector → JPEG at the board's own pixel size, alpha flattened, decoded back |
| Optimiser | `src/lib/svgoptimize.ts` | SVGO on the export copy only, with an equivalence check |
| EPS | `src/lib/epspath.ts`, `epsdraw.ts`, `epssvg.ts`, `epsverify.ts` | genuine EPSF-3.0 from vectors; unsupported features ⇒ Partial |
| Record | `src/lib/uploadrecord.ts` | `export.json` schema, fingerprints, tolerant parse, green rule |
| Re-export plan | `src/lib/uploadplan.ts` | which stages a change forces, which files may be carried over |
| Pipeline | `src/lib/uploadpipeline.ts` | the stage order, read-back verification, atomic publish |
| Jobs | `src/lib/uploadjobs.ts` | bounded concurrency, honest cancellation |
| Tab state | `src/upload/rows.ts`, `src/upload/store.ts` | one status derivation, counts, search/filter/sort, persisted defaults + overrides |
| Export runtime | `src/upload/runfs.ts`, `generate.ts`, `run.ts`, `rundeps.ts`, `epsprobe.ts` | `export/` + `.staging/` writers, one paid request per icon, per-row execution, the browser's half of the pipeline, the PostScript-renderer probe |
| The tab | `src/ui/Workbench.tsx` → `src/upload/Upload{Panel,Setup,Toolbar,List,StatusBar,Preview}.tsx` | the layout of the accepted mockup; `useUpload.ts` composes the store, `useUploadRun.ts` owns every disk call |

## 3. Decisions now fixed in code

- **40 tags**, one constant (`uploadmeta.TAG_COUNT`), used by the prompt, the
  validator and the panel.
- **The title rule is two sentences** — 5–7 words then 3–5 words, validated by
  counting; the brief's example phrase is neither required nor checked.
- **Metadata is a draft for review**: restricted-content warnings are shown, and
  no module ever claims legal clearance.
- **2.2 pt at 300 DPI** is the default stroke, and the unit/DPI pair is stored in
  `export.json`, so the number can be reproduced later.
- **15.1 MP** is a target; the achieved megapixels are computed from the decoded
  JPEG and written next to it.
- **EPS is real PostScript** emitted from the vectors, or the item is Partial.

## 4. Verification (last run of the lanes)

| Lane | Result |
|---|---|
| `npx vitest run` | **107 files, 1157 tests, all passing** (includes the upload suites, the geometry contracts and the tab's own render test) |
| `npx tsc --noEmit` | clean |
| `npx eslint src/upload src/lib/upload*.ts` | no errors; 2 complexity warnings (`rows.rowFromSource`, `rows.statusOf`) |
| `node tools/quality.mjs --changed --allow-legacy` | **PASSED** |
| `npm run build` | succeeds (single-file bundle, 1.35 MB) |

## 5. Open work, in the order it should be finished

The tab is built, wired after **Generate SVG** and green through every lane. What
is deliberately NOT claimed:

1. **No end-to-end acceptance run on a real approved folder.** Every stage is
   covered by a test that runs the real code (discovery, preparation, raster,
   embed, optimise, EPS, atomic publish, selective re-export), but no run has
   happened against a user's own folder with a real API key, because neither is
   available inside this workspace. Requirement 21 is therefore *verified by
   construction*, not yet *observed*.
2. **`verifyEps` is structural on a plain browser.** No PostScript interpreter
   exists in a page, so the EPS check reports `unavailable` for renderability
   (`epsprobe.ts` documents the host bridge that would change that: a
   `globalThis.__iconSplitterEps = { render }` backed by Ghostscript). Preflight
   says so, item by item, exactly once.
3. **The two eslint complexity warnings** in `rows.ts` (`rowFromSource`,
   `statusOf`, both 11 vs 10). They pass the RULE 16 gate; they are listed here
   so the next change to those functions knows the budget is spent.
4. **Metadata generation has no live provider test.** The request body, the
   error classes, the refusal/truncation/malformed paths and the parser are all
   tested against recorded shapes; a real `generateContent` call needs a key.

## 6. Notes for the next person

- The tab's own rules live outside it: `rows.ts` derives every status once, so a
  row cannot disagree with its record; `useUploadRun.ts` is the single place a
  disk or network call is made from, and it reads the store at call time rather
  than from a render-time snapshot.
- `UploadPanel` always renders the whole tab, even in a browser without the File
  System Access API: the note says what is missing, the buttons are disabled, and
  nothing is silently absent.
## 6. Notes for the next person

- Only approved SVGs are discovered (`svg/sources`), and `export/` is excluded,
  so an exported package can never re-enter the pipeline as source.
- Nothing outside `<pair>/export/` is written; the approved file and its history
  are read-only.
- The export JSON is written last, and a failure leaves the previous package in
  place — a half-written package is never presented as Processed.
