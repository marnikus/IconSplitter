# Stock-clean export — plan, then implementation

Status: plan (this file), implemented in the commit that follows it.
Report: the user ran the builder's own exported SVG through a forensic review and
was told it is "100% assembled by an automated, AI-powered Stock Asset Farm
pipeline". The review named four groups of fingerprints. This note turns each
one into a rule we can enforce, then into a checkbox and code.

## 1 · What the review actually found (and what it is worth)

| # | Fingerprint | Verdict | What a human-made file does instead |
|---|---|---|---|
| 1 | `data-config-fingerprint`, `data-approved-only`, `data-approved`, `data-asset-id="pair_7db67cc0"`, `data-artboard`, `data-banner`, `data-banner-text`, `data-banner-hero`, `data-export`, `data-cell-index`, `data-caption`, `data-caption-id`, `role="img"` | **real** — no design tool writes these; ours does, by design, for editing | nothing of the kind |
| 1b | `<metadata>{…"configFingerprint":…,"sources":[{ "id":"pair_…" }]}</metadata>` — ours, not Dublin Core | **real** — a JSON config hash inside a stock file | only title/description/tags |
| 2 | `<desc>` is a run-on keyword dump; `dc:subject` carries hallucinated tags (`digestion`, `vanity`, `barrel`) | **partly real** — the *shape* is ours to fix (see §3), the words are the user's/analysis model's to fix | one clear sentence, tags that match |
| 3 | odd per-icon viewBoxes (`0 0 53.1 53.1`), `scale(1.659)` + `stroke-width="1.206"`, and long floats like `1.9992750000000001` | real; also **mathematically wrong** (see the stroke rule we fixed earlier today: the pen painted `1.206 × 1.659 × 1.659`) | one grid, one stroke width, ≤3 decimals |
| 4 | `xmlns="http://www.w3.org/2000/svg"` repeated on every stitched child | **real** — the DOM-stitch artifact | declared once, on the root |

Nothing here needs the artwork touched. Every one of them is *paperwork*.

## 2 · What we already have

`lib/upload/clean.ts` is the upload flow's clean policy (2026-10-08): `data-*`,
`aria-*`, `class`, `role`, foreign elements, comments, `<style>`, per-element
namespace re-declarations, root `width`/`height` — judged by `verifyExportSvg`
and fixed by `cleandom.cleanExportDom`. It is already wired into the upload
pipeline (prepare → SVGO → `enforceExportSvg`) and its `<metadata>` subtree is
deliberately exempt.

The **builder never runs it**. Its package path is
`prepareSheetSvg → embedMetadataInSvg → files`, and the sheet's own markup is
full of editing attributes (`data-asset-id`, `data-cell-index`, …), a JSON
`<metadata>` blob, a `role="img"`, and one `xmlns` per stitched child. That is
exactly the file the review looked at.

## 3 · The plan

### 3.1 Policy additions (extend the EXISTING list, one implementation)

`clean.ts` gains one rule list entry and one rebuild step; the builder dialogs
share the option, never a second clean pass.

* **`<metadata>` is never a JSON blob in a clean file.** New rule: a root
  `<metadata>` whose text is not the Dublin Core RDF block is bloat. The clean
  pass *replaces* it: keep only `dc:title`, `dc:description`, `dc:subject`
  (tags) — the three fields the user named — and drop every other
  `rdf:Description` child (rights, creator, vocabulary additions). The upload
  flow's own DC block therefore round-trips unchanged.
* **Namespace declarations once** — already a rule; it is what removes the
  per-child `xmlns`.
* **Root**: `version="1.1"`, `viewBox`, no `width`/`height` — already a rule.
* **Numbers**: every length in the file is written with at most 3 decimals
  (`1.9992750000000001` → `2`). New rule + rebuild step over the attributes
  that can carry a length (`x y width height cx cy r rx ry x1 y1 x2 y2
  stroke-width stroke-dasharray stroke-dashoffset stroke-miterlimit
  letter-spacing font-size opacity fill-opacity stroke-opacity points d`).
  `d`/`points` are normalized token by token — geometry kept, digits trimmed.
* **`<desc>` shape**: a clean description never repeats a word and never runs
  words together (`stomachbread`): the clean pass collapses whitespace and
  removes adjacent duplicates; the words themselves stay the user's (the
  hallucination is an *authoring* problem, and the file must not silently
  rewrite the metadata the user approved).
* **`id`**: already kept only when referenced, renamed to `a`, `b`, … — and the
  EPS stage injects generated ids back for its shadings, which is why the EPS
  half needs the pass below.

### 3.2 The EPS half (`epsmetadata.ts` + a new `epsclean.ts`)

The EPS is the *other* file the review's owner uploads, and ours is full of
pipeline traces: 3–4 `% IconSplitter XMP setup/trailer begin` blocks, a
Photoshop/IPTC hex resource block (`% IconSplitter IPTC begin`), an
`%ADO_ContainsXMP` header line, generated `IconSplitterXmp_<hex>` dict names and
`/IconSplitterStream_<hex>` obj names, and `%%Creator` / `%%CreationDate`.

Clean-export rule: **exactly one** metadata carrier per file.

* Keep the single document XMP packet (`/Metadata` pdfmark) — it is where a
  stock site reads title/description/tags from an EPS, and it is already
  limited to `dc:title`, `dc:description`, `dc:subject`.
* Drop the IPTC/Photoshop hex resource block and the `%ADO_ContainsXMP` line
  when the checkbox is on (they only duplicate the packet).
* Strip our own generator names from the program: the `IconSplitterXmp_<hex>` /
  `IconSplitterStream_<hex>` identifiers become short opaque names (`M`, `S`),
  the `% IconSplitter …` comment markers go, and `%%Creator`/`%%CreationDate`
  are removed.
* The result must still pass `verifyEpsDocument` (DSC envelope + the closed
  PostScript grammar) — that is the honesty gate: an EPS that stops being
  executable fails the stage, it is never shipped.

### 3.3 The control (one checkbox, both flows)

New field `cleanExport: boolean` in `ExportFormatOptions` (`exportformats.ts`),
so it lands in the shared format domain, both stored payloads, both dialogs,
`SETTINGS_FIELDS`, the fingerprint, and every plan/record for free.

* Row: **“Clean export (remove pipeline traces)”** in `FormatTransformRows`
  (`ui/exportrows.tsx`), testid `{prefix}-clean`, with a hint naming what goes:
  `data-*`/`aria-*`/class/role, per-element xmlns, the JSON <metadata> (only
  title, description and tags stay), long floats, and the EPS generator blocks.
* Default **on** for the builder (a sheet is a delivery, not an editable
  document) — and this is the one field whose default may differ: it is read
  back as `true` unless stored `false`, like the other delivery defaults.
  The upload flow already cleans unconditionally, so the flag there is a no-op
  switch that must stay honest: turning it off must not break the existing
  behaviour, so the upload path keeps cleaning regardless and the row is shown
  as “always on for this tab”? — **No.** Simpler and honest: the flag is real
  in both flows; the upload flow's clean policy was never optional, so the flag
  reads `true` by default and un-ticking it is what the user asks for
  (an escape hatch for the "as is" case). The pipeline then skips
  `enforceExportSvg`, exactly like the existing `asIs` branch already does.

### 3.4 Where it runs

* **Builder** (`sheetpackage.ts`): after `prepareSheetSvg` (expand/rescale/
  SVGO), before `embedMetadataInSvg`:
  `cleanExportSvg(svg)` → SVGO again is not needed; then embed the DC metadata
  (which is clean by construction) → EPS from the same cleaned text →
  `cleanExportEps` after `embedXmpMetadataInEps`. Recorded in
  `tools.clean = { enabled, removed: string[], svgBytes, epsBytes }` so
  export.json says what the file lost.
* **Upload** (`exportstages.ts`): `enforceExportSvg` gains the `cleanExport`
  gate; `buildEps` runs `cleanExportEps` after the XMP embed (and re-verifies).

### 3.5 Tests (TDD, all against real composed sheets)

1. `tests/export_clean_dom.test.ts` — the new rules on a real composed sheet:
   no `data-*`/`aria-*`/`class`/`role`, `xmlns` only on the root, `version="1.1"`,
   no `width`/`height`, `<metadata>` reduced to DC title/description/subject,
   every number ≤3 decimals, `<desc>` without a run-on duplicate, and the
   picture unchanged (same `viewBox`, same number of shapes, same `d` after
   normalization). Idempotent.
2. `tests/export_clean_eps.test.ts` — one metadata carrier, no `IconSplitter`
   text anywhere, no IPTC hex block, still `verifyEpsDocument`-clean, and the
   XMP packet still reads back through `readXmpMetadataFromEps`.
3. `tests/builder_export_clean.test.tsx` — the checkbox exists once in the
   builder dialog, defaults on, patches the store; the package with it on has
   none of the traces; with it off it keeps them (the difference is asserted,
   so the flag is proven to do something).
4. `tests/upload_export_clean.test.ts` — the upload flag gates
   `enforceExportSvg` and the EPS pass; the package still verifies.

### 3.6 Docs

`sor/export-formats.md` (the flag and its rules), `sor/svg-builder.md`,
`sor/upload-export.md` (where the clean pass sits), `selectors/*` (the new
testid), `sor/tests/*`, `QUALITY_RECHECK.md` (dated entry), and this file keeps
the mapping *fingerprint → rule → test*.
