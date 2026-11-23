# The EPS document this writer ships

Part of [upload EPS](upload-eps.md) (2026-11-19): the delivered file reads like
a drawing program's document, not like a walker's log. One module owns each
fact: `src/lib/upload/epsdoc.ts` (document), `eps.ts` (body + writer state),
`epspath.ts` (geometry), `epsgradientfill.ts` (shading), `epscheck.ts` (gate).

## Header (`epsdoc.commentLines`)

DSC minimum (`%%BoundingBox`, `%%HiResBoundingBox`, `%%DocumentData: Clean7Bit`,
`%%LanguageLevel: 3`) plus the set an Illustrator-compatible export carries:
`%%DocumentProcessColors`, `%%DocumentSuppliedResources: procset VectorEPS 1.0 0`,
`%%Pages: 1`, `%%PageOrder`, `%%PageOrigin: 0 0`, `%AI3_ColorUsage`,
`%AI5_FileFormat`, `%AI3_DocumentPreview: None`, `%AI5_ArtSize` (height then
width, per AI7), `%AI5_NumLayers`, `%AI3_TemplateBox`, `%AI3_TileBox`.

`%%Title: (…)` is a DSC string (escaped). `%%CreationDate` is DSC's own form
`D:YYYYMMDDHHmmSS±HH'MM'` (`dscDate`); an input that is not a timestamp with a
zone omits the line — a made-up date is worse than none.

**`%%Creator: IconSplitter`.** Never `Adobe Illustrator(R)`, never a fabricated
`xmpMM:DocumentID`: satisfying the review by claiming another program wrote the
file misrepresents authorship. The procset is our own name (`VectorEPS`), so the
header never names an Adobe resource either. The clean-export option still
removes `%%Creator`/`%%CreationDate` for a file with no producer identity — an
anonymous file is honest, a falsely attributed one is not.

## Prolog + setup

`%%BeginProlog` holds `%%BeginResource: procset VectorEPS 1.0 0` with one
`/alias {operator} bind def` each for `n m l c h f f* S W w J j M d rg q Q` —
the exact set the body may use, which is what makes the body short.

`%%BeginSetup` holds what a document sets ONCE: the uprighting matrix
(`[0.75 0 0 -0.75 tx ty] concat`, anchored to the exact HiRes artboard) and the
pen defaults `1 w [] 0 d 0 J 0 j 4 M`.

## Body

* Paths: `x y m`, `x y l`, `x1 y1 x2 y2 x y c`, `h`.
* Paint: `rg path f` / `… f*` (even-odd), `pen rg path S`.
* Gradient: `path q W [space matrix] concat << … >> shfill Q` (`W*` for
  even-odd). The clip and the path restore live inside the save, so a following
  stroke cannot inherit a clip.
* ONE shared `WriterState` (the walk context is copied per element — the state
  deliberately is not) remembers pen width/dash/cap/join/miter and the colour;
  only a value that CHANGES is written. A run of same-inked shapes says `rg`
  once; a shape that keeps the setup's pen writes no pen operator at all.
* **No identity matrix and no per-shape save.** A group's transform is replayed
  as ONE `q [matrix] concat … Q` around its children; a shape with its own
  transform is wrapped on its own; `[1 0 0 1 0 0]` cannot be emitted.
* **A filled-and-stroked shape states its path for each paint** (`path f …
  path S`). PostScript leaves the current path alone; the closed gate reads a
  painting operator as consuming it (I-61). Stating the path is correct under
  both readings and is what cairo and Illustrator write.
* One named layer brackets the artwork: `%AI5_BeginLayer`, the `Lb` operand
  line, `(name) Ln`, `LB`, `%AI5_EndLayer--`. `EpsOptions.layerName`, default
  `Layer 1`.

## The gate's vocabulary (`epscheck.ts`)

The operand-stack model stays CLOSED, so it learned exactly what the writer may
now emit: `POPS` holds each alias, `CANONICAL` folds it onto the long operator
whose effect applies (`m→moveto`, `f*→eofill`, `W*→eoclip`, `q→gsave`, …);
`shfill` paints itself and needs no current path; Illustrator's layer block is
`Lb` (ten numbers), `Ln` (a string), `LB` (nothing); a `(…)` literal is kept as
one opaque string token. A display-list line is skipped — that is what the
existing rule already did. A prolog line of the exact shape `/name {op} bind def`
is accepted as a DEFINITION and not executed: an operator is modelled only when
the body CALLS it. Everything else still fails closed, so an injected `image`,
`currentfile` or unknown token is still refused by the commit gate.

## Size, measured

A twelve-shape run is ~55 bytes of body per shape (path + `f`), against ~100
before (save, identity matrix, full-word operators, restore). On the builder's
composed sheet the whole EPS is ~2.1 KB where the old form was ~2.4 KB with less
artwork in it. Owner tests: `tests/eps_human_export.test.ts` (11),
`tests/upload_eps.test.ts`, `tests/upload_epscheck.test.ts`,
`tests/upload_epsgradient.test.ts`, `tests/upload_strokecaps.test.ts`,
`tests/export_stroke_width.test.ts`.
