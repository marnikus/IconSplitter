# 2026-11-19 — the delivered EPS and SVG read as drawings, not as a script's log

## The report

A review of a delivered package listed what made the two vector files look
machine-assembled rather than drawn:

1. an EPS header that is only the minimum DSC envelope, with `%%BeginProlog`
   and `%%BeginSetup` present but EMPTY;
2. full-word PostScript (`newpath … moveto … lineto … closepath … setrgbcolor
   … setlinewidth … setlinecap … setlinejoin … setmiterlimit … stroke`) instead
   of the short operators a drawing program's prolog supplies;
3. `[1 0 0 1 0 0] concat` before almost every shape, plus `gsave`/`grestore`
   around each one — the walker's decisions, visible;
4. an ISO `%%CreationDate` (`2026-11-19T00:00:00.000Z`) where DSC wants `D:…`,
   and a `%%Creator` naming the tab — **both now dropped entirely** (RULE 26,
   see below: a delivered file names neither the tool nor the moment);
5. an SVG that still had the composer's skeleton after the clean pass: chains
   of `<g>` and attributes that only restate SVG's defaults.

The report also claimed three things that were **not** true of this code; those
are recorded here so nobody "fixes" them later:

* `%AI5_ArtSize` was already written **height then width**, which is what the
  AI7 file-format spec documents. It was left alone.
* There was no random hex hash in the EPS object names at that point — the
  clean pass had already renamed them (`DocMeta`, `DocStream`), and the packet
  marker is a stable suffix of the metadata fingerprint.
* Stock sites do not require Illustrator provenance (Adobe Stock accepts EPS,
  AI and SVG, outlines text, < 45 MB). "Look like Illustrator wrote it" is a
  review-taste goal, never a technical requirement — and it must not be met by
  lying about who wrote the file.

## The one line that could not be crossed

`%%Creator: Adobe Illustrator(R) 24.1 (Windows)` and a fabricated
`xmpMM:DocumentID` would satisfy the letter of the request and misrepresent the
authorship of the file. Both were refused, and no `Adobe Illustrator` string
appears anywhere; the writer supplies its OWN procset (`VectorEPS` — never an
Adobe resource name).

**Superseded the same day by RULE 26** (`docs/current/rules/DOCS_AND_SAFETY.md`,
2026-11-23): this round first answered the attribution question the other way,
naming itself (`%%Creator: IconSplitter`) and stamping a DSC `%%CreationDate`.
The user's rule is stricter and simpler — **a delivered file carries ZERO
machine attribution**, its own tool's included. So there is no `%%Creator`, no
`%%CreationDate`, no `%ADO_*`, no `x:xmptk`, and `dscDate` was deleted with
them; `EpsOptions.createdAt` is still accepted and deliberately ignored.
Anonymous is honest; a false attribution is not; a true one the user did not ask
for is still theirs to refuse.

## What changed

### EPS document layer (`src/lib/upload/epsdoc.ts`)

* The comment set a real Illustrator-compatible export carries:
  `%%Title` as a DSC string (DSC-escaped),
  both boxes, `%%DocumentData: Clean7Bit`, `%%LanguageLevel: 3`,
  `%%DocumentProcessColors`, `%%DocumentSuppliedResources: procset VectorEPS`,
  `%%Pages`, `%%PageOrder`, `%%PageOrigin`, `%AI3_ColorUsage`,
  `%AI5_FileFormat`, `%AI3_DocumentPreview: None`, `%AI5_ArtSize`,
  `%AI5_NumLayers`, `%AI3_TemplateBox`, `%AI3_TileBox`.
* A **prolog that supplies the operators the body uses**:
  `/n /m /l /c /h /f /f* /S /W /w /J /j /M /d /rg /q /Q`, each a
  `{longOperator} bind def`, inside `%%BeginResource: procset VectorEPS 1.0 0`.
  The header's `%%DocumentSuppliedResources` names that same procset, so the
  declarations and the definitions cannot drift.
* A **setup** that holds what a document sets once: the uprighting matrix
  (`[0.75 0 0 -0.75 tx ty] concat`) and the pen defaults
  `1 w [] 0 d 0 J 0 j 4 M`.
* One named layer around the artwork (`%AI5_BeginLayer`, the `Lb`/`Ln` operand
  lines, `LB`, `%AI5_EndLayer--`) instead of a bare body — a drawing program
  names its layers.
* `dscDate(iso)` converted a timestamp to `D:YYYYMMDDHHmmSS±HH'MM'`; RULE 26
  then removed the `%%CreationDate` line it fed, so the function is gone.

### EPS body (`src/lib/upload/eps.ts`, `epspath.ts`, `epsgradientfill.ts`)

* **All emitted state lives in one `WriterState`** shared by every walk step
  (the walk context is copied per element; the state deliberately is not),
  holding the pen (`width`, `dash`, `cap`, `join`, `miter`) and the colour.
  A body writes a value only when it differs from what is already set, so a run
  of same-inked shapes writes `rg` once and a shape that keeps the setup's pen
  writes no pen operator at all.
* **No identity matrices.** A transform is replayed as ONE `q [matrix] concat …
  Q` around the group it belongs to; a shape with its own transform is wrapped
  on its own; a shape without one is not wrapped. `[1 0 0 1 0 0]` can never be
  emitted (`isIdentity` short-circuits before `matrixPs`).
* **Path construction** is `x y m`, `x y l`, `x1 y1 x2 y2 x y c`, `h`.
* **Painting** is `rg … path f` / `… f*`, `… path S`, or, for a shape with both
  paints, the path stated for each paint. That decision is worth its own note:
  PostScript's painting operators leave the current path intact, but the
  closed-stack checker (`epscheck.ts`) models them as consuming it (the way
  `fill` behaves in a real interpreter for the following operator, I-61). A
  gradient originally ran `clip` INSIDE the same `q … Q` that a following
  `stroke` relied on, so the stroke lost its clip in a real interpreter. Both
  halves are now consistent with the stricter reading:
  * a fill is `rg path f`, a stroke is `pen rg path S`;
  * a filled-and-stroked shape states its path twice (`path f` then
    `path S`) — exactly what cairo and Illustrator write;
  * a gradient fill is `path q W [space matrix] concat << … >> shfill Q`
    (the clip and the path restore are inside the save).
* **A width is written in the SVG's own local units** (unchanged rule): the
  px→pt 0.75 and any group scale come from the CTM, never from the number.

### EPS program model (`src/lib/upload/epscheck.ts`)

The operand-stack model is still closed — that is the point of it — so it
learned the new vocabulary: every alias in `POPS` with its canonical operator
in `CANONICAL` (`m l c h f f* S W W* w J j M d rg q Q n`), `shfill` (paints
nothing itself, needs no current path), Illustrator's layer block
(`Lb` with ten numbers, `Ln` with a string, `LB`) and a `(…)` literal kept as
one opaque string token. A prolog line of the exact shape
`/name {op} bind def` is accepted as a definition and NOT executed; the
operator is only modelled when it is CALLED. Anything else still fails closed.

### SVG skeleton (`src/lib/upload/skeleton.ts`, called from `cleandom.ts`)

A new pass, and the reason it exists: after the traces, numbers and namespaces
were gone, the delivered file still carried

* **bare `<g>` chains** — a group with no attributes and no text of its own
  wraps nothing a reader needs, so its children move up (repeat until stable:
  the chains are what look composed). A group with ANY attribute is kept.
* **default restatements** — `rx="0"`, `ry="0"`, `fill-opacity="1"`,
  `fill-rule="nonzero"`, `stroke-linecap="butt"`, `stroke-linejoin="miter"`,
  `stroke-miterlimit="4"`, `stroke-dashoffset="0"`, `stroke-dasharray="none"`,
  `opacity="1"`. One exception, and it matters: an explicit default that
  OVERRIDES an inherited value (`stroke-linecap="butt"` inside a `round` group)
  is a decision, not a restatement, and stays. Non-inherited properties
  (`rx`, `ry`, `opacity`) never need that test.

`svgclean.ts` reports both as removed traces, so `export.json` can still say
what the delivered file lost.

### A side effect worth naming

`validateBadgeTemplate` stores a **canonical** document and `readBadgeTemplate`/
`readShadowTemplateSetting` re-validate it, so the pass has to be stable: the
new attribute removals changed the serialized attribute ORDER and the round trip
stopped being byte-identical. `canonicalTemplate` now writes one fixed attribute
order (`xmlns, version, viewBox`, the paint properties, then the rest
alphabetically). Order never changes rendering.

## Verification

* `tests/eps_human_export.test.ts` (11) — header, prolog, setup, no identity
  matrix, one wrapper per group, short operators, only changed pen values,
  both paints kept, still executes, per-shape body < 55 bytes.
* `tests/svg_human_export.test.ts` (8) — group unwrapping, kept groups, default
  pruning with the inherited-override exception, unchanged geometry/paint,
  reported traces, and the shipped builder sheet (no `data-*`, no filler
  `<desc>`, no bare-group chains).
* The suite's older assertions were moved to the new form wherever they pinned
  the verbose one (header title/date, `setrgbcolor`→`rg`, `setlinecap`→`J`,
  `curveto`→`c`, `newpath`→path operators, `gsave`→`q`). None of them was
  weakened: the cap/join/width/box/execution guarantees are all still asserted,
  now read out of the program the way an interpreter reads it (a value that is
  NOT written is the setup's default).
* Full suite **498 files / 4939 tests green**, `tsc --noEmit` clean,
  `tools/quality.mjs --changed` GATE PASSED.
