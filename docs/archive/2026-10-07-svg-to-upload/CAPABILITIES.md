# SVG to upload — capability research (2026-10-07)

Everything below was checked against the live documentation on 2026-10-07, not
recalled from memory. Where a source disagrees with the brief, the resolution in
`DESIGN.md §4` wins and is named here.

## 1. Gemini provider

| Fact | Value | Source |
|---|---|---|
| Model identifier | `gemini-3.1-flash-lite` (stable, GA 2026-05-07) | ai.google.dev model page `.../models/gemini-3.1-flash-lite` |
| Model id in the brief | `gemini-3.1-flash-lite` — **verified, used verbatim, never substituted** | same |
| Inputs / outputs | text, image, video, audio, PDF in → **text out** (no image generation) | same |
| Limits | 1,048,576 in / 65,536 out tokens; structured outputs supported | same |
| REST endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | ai.google.dev generateContent docs |
| Auth | header `x-goog-api-key: <key>` (query `?key=` also accepted) | ai.google.dev docs |
| Image part | `contents[].parts[] = { inlineData: { mimeType, data } }` (base64) | ai.google.dev image-understanding / gemini-3 docs |
| Structured output | `generationConfig.responseMimeType = "application/json"` + `responseSchema` | ai.google.dev structured-output docs |
| Usage | `usageMetadata.promptTokenCount` / `.candidatesTokenCount` / `.totalTokenCount` | generateContent docs |
| Finish reasons | `STOP`, `MAX_TOKENS`, `SAFETY`, `PROHIBITED_CONTENT`, `RECITATION`, … | generateContent docs |
| Errors | HTTP 400 `INVALID_ARGUMENT`, 401/403 auth, 429 `RESOURCE_EXHAUSTED`, 5xx | Gemini API error docs |
| Price (used for the ESTIMATE only) | $0.25 / 1M input, $1.50 / 1M output | ai.google.dev/gemini-api/docs/gemini-3 pricing table |

Consequences implemented:

* **Words, not pictures.** The icon image is sent *to* the model; the answer is
  metadata text. Nothing in this feature asks Gemini to draw.
* **Cost is an estimate** unless the provider reports money. The Gemini REST
  answer reports tokens, not currency, so every number this tab shows is
  labelled *Estimated* and carries the pricing/date the estimate used.
* **No duplicate paid submission.** A request that ends without a definitive
  answer (timeout, aborted stream, unknown finish reason) is recorded as
  *unknown*; the user decides whether to send again. A retry inside the client
  only happens for an answer that is provably not in flight (connection error
  before any byte, or a 429/5xx *before* the body arrived).

## 2. SVGO

* Package: `svgo@4.1.0`, browser entry `svgo/browser` (`optimize`) — verified by
  installing it and reading `exports` in its `package.json`.
* Config used (pinned in `svgoptimize.ts`): `preset-default` with
  `removeViewBox: false`, `removeMetadata`/`removeTitle`/`removeDesc` **off**
  (the metadata we embed is the payload), `cleanupIds: false` (ids are referenced
  by `url(#…)` in previews and must not move), `convertShapeToPath: false`,
  `mergePaths: false` (merging can change fill-rule appearance), `floatPrecision: 3`.
* **Stroke-to-outline conversion does not exist in default SVGO** — the risk the
  brief names comes from *`convertPathData` rounding* and from `convertShapeToPath`;
  both are contained by the equivalence check in §4 below, which compares the
  rendered artwork (element counts, path bounds, stroke declarations) before and
  after, and refuses the optimised copy when they differ.
* SVGO failure is never fatal: the original copy is shipped and flagged.

## 3. Rasterisation to 15.1 MP

* Browsers expose no vector rasteriser except `canvas.drawImage(img)` with an
  SVG `img` (a `<img src="data:image/svg+xml,…">`), which renders the SVG at the
  requested device size — i.e. the JPEG is rendered **from the vectors at the
  target size**, not upscaled from a preview. Verified against
  `HTMLCanvasElement.toBlob("image/jpeg", quality)`.
* `canvas.toBlob` writes **no metadata** and flattens alpha onto the canvas
  background only if the canvas was painted first — so the export paints the
  configured background colour before drawing. Alpha is therefore flattened
  onto an opaque colour by construction; `jpegmeta.ts` re-checks by reading the
  SOF component count (3 = no alpha channel).
* JPEG cannot carry alpha or ICC profiles written by `toBlob`; the profile
  setting is recorded in `export.json` and stated in the UI rather than faked.

## 4. Metadata containers

| Container | What is genuinely supported | Implemented |
|---|---|---|
| SVG | `<title>`, `<desc>`, `<metadata>` (RDF/Dublin Core, `dc:subject` for keywords) | yes, XML-escaped, Unicode-safe, read back and compared |
| JPEG | XMP packet in **APP1** (`http://ns.adobe.com/xap/1.0/`), IPTC IIM in **APP13** (`Photoshop 3.0` 8BIM resource 0x0404) | both written, both read back and compared |
| JPEG alpha | none | flattened before encoding, verified via SOF |
| EPS | DSC comments only (`%%Title`, `%%CreationDate`); no Dublin Core | title written as a DSC comment, the rest stays in `export.json` |

The brief's "IPTC/XMP Title, Description, Keywords" is met by writing **both**
containers (some stock platforms read only one), with the same values, and by
re-reading both from the produced bytes.

## 5. EPS

* CairoSVG (the brief's suggestion) cannot run in a browser and, as the brief
  itself notes, does not emit EPS. No PDF/PostScript binary is available to this
  app, so "PS/PDF → EPS" is impossible here **without pretending**.
* Implemented instead: `epssvg.ts` emits **EPSF-3.0 PostScript directly** from
  the SVG geometry (DSC header + `%%BoundingBox`, `moveto/lineto/curveto/
  closepath/fill/stroke/setrgbcolor/setlinewidth/setlinejoin/setlinecap`).
  A renamed PS/PDF is never produced because nothing is renamed — the file *is*
  a PostScript program.
* Verification: `%!PS-Adobe-3.0 EPSF-3.0` first line, one `%%BoundingBox` with
  four integers, `%%BoundingBox` matching the computed geometry, `showpage`,
  `%%EOF`; plus a readability check of every emitted operator name.
* Honest limitations (recorded per icon, status becomes **Partial**):
  gradients, patterns, filters, clipping paths, masks, text and embedded rasters
  are not expressible; those elements are skipped and counted in the record.
* License/deps: none added — the converter is this repository's own code, so it
  works offline, on every platform, with no binary to install.

## 6. Contradictions in the brief and their resolutions

| Contradiction | Resolution |
|---|---|
| "50 keywords" in the notes vs 40 in the prompt/template/example | **40** (one constant, used by prompt, validator and UI) |
| "3–5 words" second sentence vs the example's fixed 6-word phrase | sentence 1 = 5–7 words, sentence 2 = 3–5 words, **word counts are authoritative**; the phrase is not required |
| "genuine EPS via CairoSVG" vs CairoSVG not producing EPS | emit EPSF-3.0 ourselves; mark partial when a construct cannot be expressed |
| CairoSVG "supported pipeline" vs a browser-only app | documented here; no binary dependency is introduced |
| "15.1 MP JPEG" vs "preserve other proportions" | integer width/height from ONE scale factor; the achieved MP is shown, never rounded up to a claim |
| "optimise SVG" vs "preserve metadata" | optimise **before** embedding, then verify the embedded copy; metadata is never at risk |
| "record real provider token/cost" vs Gemini reporting tokens only | tokens are recorded as reported; money is labelled **Estimated** with its rate card and date |
