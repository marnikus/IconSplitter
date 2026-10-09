# An EPS Illustrator can open · an artboard that IS the artwork · "scale to N MP"

Date: 2026-10-09 · Area: SVG to upload (export pipeline) · Status: Commit A (D1, I-61) SHIPPED 2026-10-09 — the executable check lives in the built-in converter (`verifyEps` before it answers ok → EPS-stage failure → `partial`), not in `exportvalidate`, which stays converter-neutral; Commit B (D2–D4, I-60) SHIPPED 2026-10-09 with two deviations: (1) there is no separate `normalise` bake — every pass clones the cleaned source and bakes the artwork's transforms together with the artboard's placement (one rounding, `vector-effect` honoured natively), and expansion runs AFTER the bake+restyle on each candidate so the expanded outline is the setting's px under any scale; (2) the measurement is exact, not the conservative hull — `shippedBounds` expands the strokes on a probe copy, and `visibleBounds` ignores shapes that paint nothing (fill none, no stroke); the loop settles at the file's precision (0.002 px), stricter than the 0.01 % drafted; Commit C (D5, I-62) SHIPPED 2026-10-09 — the note's testid is `upload-set-mp-scale-note` (the drafted `upload-set-mp-note` already names the JPEG row's hint), the batch log does not name settings per run (the row line does), and `scaledTo` is recorded only while the target really applies (null with a pinned artboard, Q3 answered: `megapixels` is recorded for every artboard)

## 1. What the user asked for

1. **The built-in EPS does not open in Adobe Illustrator.** The diagnosis the user
   brought (Vectorfix): line 14 reads `-0.75 0 0 -0.75 0 750 concat`; `concat` takes
   ONE array `[a b c d tx ty]`, so the bare numbers leave `750` on top of the operand
   stack and the interpreter stops with `/typecheck` before it reaches the artwork.
   The fix is `[0.75 0 0 -0.75 0 750] concat` — same scale, same flip, no coordinate
   change. A missing preview or `showpage` is **not** the cause.
2. **The artboard was not adjusted to the artwork.** The artboard must be exactly the
   full artwork's width and height; no object may lie outside it.
3. **New control — "scale to N MP".** Select the full artwork, outline/expand it first
   when that preference is on, scale it so that W × H of the full artwork equals the
   required megapixels (example 10 MP), and make the artboard that same size — some
   stocks require an artboard of at least 4 MP even for a vector.

**Answers given 2026-10-09 (ask_user):**

* *Padding* — "padding defines only how small the icon is against the full artboard it
  sits in; the full artwork is the icon **plus a rect around it** (filled with the
  background, or transparent with only the rectangle's bounds — it does not matter
  here)." → padding stays, and its meaning becomes exact: **artboard = full artwork =
  icon + the artboard rect**; the rect is always present (§3 D4).
* *Where the MP control lives* — "in the export settings" (the settings dialog, §4).
* *Strokes when scaling with expansion OFF* — **keep the verbatim px width** (the
  setting's number stays in the file; geometry grows around it).
* *Default MP target* — **5 MP**.

Process: TDD, every rule in `docs/current/AGENT_RULES.md`, RULE 16 gates and RULE 18
ideals re-checked at the end, same-commit docs, commit `<type>(<area>): …` +
`Verified:` line, push to `arena/086ed6a7-iconsplitter`.

## 2. Measured facts (research, read-only — reproduced in this sandbox)

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | `epsdoc.assemble` writes the uprighting CTM as bare numbers: `0.75 0 0 -0.75 0 7.5 concat` (reproduced). Per-shape CTMs are correct: `[1 0 0 1 0 0] concat` | `src/lib/upload/epsdoc.ts:59`, `eps.ts:143` | One line is the whole of problem 1 — and `tests/upload_eps.test.ts:81` **pins the broken form** (`toContain("0.75 0 0 -0.75 0 69.6 concat")`): the test enshrined the bug, so the red test must *replace* it, not join it |
| F2 | A shape with both paints emits `… setrgbcolor fill 0 0 0 setrgbcolor 1 setlinewidth … stroke` (reproduced). PostScript `fill` **consumes** the current path, so the following `stroke` paints nothing — every filled-and-stroked shape loses its stroke in the EPS | `eps.ts emitShape` | Second EPS defect, same file: `gsave … fill grestore … stroke` |
| F3 | `verifyEps` checks DSC markers only; nothing checks that the program is **executable** (operand arity/types). Ghostscript is not available in the sandbox or in CI | `epsdoc.ts verifyDsc` | A small stack checker for the writer's own operator subset catches F1-class errors before commit, and forever |
| F4 | `prepare` measures the artwork **before** it restyles strokes: order is `visibleBounds → fitArtboard → bake → restyleStrokes → expandStrokes → unifyStrokes → applyArtboard`. Reproduced: source stroke 1 px, setting `strokePx: 8`, padding 0 → `viewBox="0 0 82.236 82.236"` computed for a 1 px stroke, while the 8 px miter corners reach ≈ 8.9 px **outside** the artboard | `src/lib/upload/prepare.ts ~75–85` | The cause of problem 2: the artboard is built from the artwork as it *was*, not as it *ships*. Expansion (joins, caps, miters) has the same effect |
| F5 | `bakeGeometry(root, M)` multiplies every `stroke-width` by `scaleOf(M)` (unless non-scaling); `restyleStrokes` then overwrites it with the verbatim setting. In a pinned artboard with scale < 1 the verbatim stroke is therefore *thicker* than the fit assumed → spill there too | `bake.ts:85`, `prepare.ts` | The placement must be computed from bounds measured **at the final widths**; with verbatim widths and a scale ≠ 1 that is a short fixed-point loop (§3 D3) |
| F6 | The background rect is inserted only when the background is a colour; with `transparent` nothing marks the artboard, so "select all" in Illustrator is the icon, not the artboard | `prepare.ts applyArtboard/backgroundRect` | D4: the rect is always there (`fill="none" stroke="none"` when transparent) |
| F7 | `fmt` rounds to 3 decimals; a bake writes rounded coordinates | `geom.ts:129` | Never bake the same DOM twice: each placement attempt bakes a **clone** of the one normalised DOM (no cumulative rounding) |
| F8 | SVGO `preset-default`: `removeUselessStrokeAndFill` strips `stroke="none"` but removes an element only with `removeNone: true` (not set); `removeHiddenElems` targets `display:none`, zero size, empty paths — not `fill="none"` | `optimize.ts OPTIMIZE_CONFIG` | An invisible artboard rect survives optimisation — pinned by a test, not assumed |
| F9 | Artboard modes: `content` (hug + padding, scale 1) / `preset` / `custom` (exact px, artwork scaled in). `settingsFingerprint` appends a field **only when non-default** (2026-10-09), pinned defaults fingerprint `36232c04` | `artboard.ts`, `settings.ts:249–260` | The new MP fields follow the `expandStrokes` pattern; no package goes stale by default |
| F10 | The JPEG size: pinned artboard + `jpegMatchArtboard` → exact px; else `targetDimensions(fit.artW, fit.artH, jpegMegapixels)` (ratio from the fit) | `exportstages.ts:123–131` | Unchanged — the artboard ratio it reads is the corrected one |
| F11 | `UploadSettingsDialog.tsx` is 236 lines; the artboard block (`ArtboardSetting`, `CustomSize`, helpers) is ≈ 65 of them | `src/upload/UploadSettingsDialog.tsx:118–186` | RULE 18: the block moves to its own file and the MP control joins it there |
| F12 | `expandStrokes(root)` works on the current DOM's stroke widths; `visibleBounds` returns stroke-extended bounds (miter/cap aware) | `expand.ts`, `geom/bounds.ts` | Measuring **after** restyle + expansion gives the exact shipped extents in one call |

## 3. Decisions

### D1 — The EPS is an executable program, and the writer proves it (problem 1)

* `assemble` writes `[a b c d tx ty] concat` — one array, exactly like the per-shape CTM.
* `emitShape` paints both: `gsave <fill colour> setrgbcolor fill grestore <stroke…> stroke`
  when the shape has a fill *and* a stroke; fill-only and stroke-only lines are unchanged.
  A shape with **neither** paint emits nothing (an unpainted path is not an object in
  PostScript; the DSC bounding box carries the artboard — see D4 for the EPS).
* New `lib/upload/epscheck.ts` — `checkPostScript(body): string[]` — a **stack checker for
  the writer's own subset**: tokens are numbers, `[`/`]` arrays, names; operators
  `newpath moveto lineto curveto closepath concat setrgbcolor setlinewidth setdash
  setlinecap setlinejoin setmiterlimit fill stroke gsave grestore` each pop their
  documented operand count and types and leave the stack as PostScript would. It reports
  `line N: concat expects an array, found number` — the user's exact failure — plus
  unbalanced `gsave`/`grestore`, a leftover stack at `%%EOF`, and any token outside the
  subset. `verifyEps` (the built-in's strict contract) calls it; `verifyEpsDocument`
  (the converter-neutral gate Inkscape's cairo output passes) does **not** — cairo's
  PostScript defines procedures and dictionaries the subset checker must not judge.
  The check also runs at commit (`exportvalidate`), so a non-executable EPS is a
  `partial` row, never a shipped file.
* Not added, on purpose: `showpage`, `%%Pages`, a TIFF/WMF preview — none is required for
  an EPS import, and the user's diagnosis says so.

### D2 — The artboard is built from the artwork **as it ships** (problem 2)

`prepareExportSvg` becomes two phases:

```
normalise   clean → bake(identity: fold the artwork's own transforms, scale 1)
            → restyleStrokes (verbatim px, colour) → expandStrokes (if on)
            → unifyStrokes
place       measure = visibleBounds(final DOM)          ← strokes/expansion included
            → fit = fitArtboard(measure, paddingPct, target)   (target: pinned | MP | none)
            → bake(clone, translate·scale) [+ re-apply verbatim widths when scale ≠ 1]
            → verify: measure(clone) sits inside the artboard (or re-fit, D3)
            → applyArtboard: viewBox, the artboard rect (D4)
```

`content` mode (scale 1): one pass, exact by construction — the viewBox is the measured
box plus the padding on every side, so with padding 0 the artboard **equals** the full
artwork to 3 decimals, and nothing can lie outside it (I-60).

### D3 — Verbatim strokes under a scale: a short fixed-point loop, never a guess

With `strokePx > 0`, expansion off, and a scale k ≠ 1 (pinned artboard, or D5's MP
scaling), the geometry scales but the stroke extents do not, so the box after placement
is not k × the box before. `placeArtwork` therefore iterates on a **clone** of the
normalised DOM (F7): bake(k) → re-apply verbatim widths → measure → compare with the
target; `k ← k · correction`; at most 4 passes, stop when the residual is below 0.01 %
of the artboard edge. The last pass is then re-measured and **centred by translation**
(a translation changes no extent), so the final check "inside the artboard" is exact.
When `strokePx = 0` or expansion is on, the first pass is already exact and the loop
runs once. The pass count is recorded (`tools.artboard.passes`) — honesty about the
work done, never a hidden retry.

### D4 — The artboard rect is always part of the artwork (the user's definition)

`applyArtboard` always inserts the artboard rect first: `fill="<background hex>"` when a
background is set, `fill="none" stroke="none"` when transparent (invisible, but an
object — "select all" in Illustrator is then the artboard). Pinned by tests through the
whole pipeline: it survives `cleanExportDom`, SVGO (F8) and the clean-code report (which
must not flag it as junk). In the **EPS**, an unpainted shape emits nothing (D1); the
`%%BoundingBox`/`%%HiResBoundingBox` is the artboard, which is what Illustrator makes the
artboard on open. The row's clean-code line keeps saying "clean" for it.

### D5 — "Scale to N MP" is an artboard target, not a new mode (problem 3)

The user's full artwork **is** the artboard (icon + rect). So "artwork = N MP" means:
take the content fit (icon + padding), scale it uniformly by `k = √(N·10⁶ / (artW·artH))`,
and the artboard is that scaled box — the padding still defines "how small the icon is"
inside it. Implemented as a third kind of `fitArtboard` target: `{ megapixels: N }`
alongside `{ width, height }` and none. Strokes keep the verbatim px (the user's answer);
with D3's loop the area lands on N MP within 0.01 %, and the viewBox is written to 3
decimals. With expansion on, everything is fills and the first pass is exact.

* Settings: `scaleToMegapixels: boolean` (default **false**) and `artboardMegapixels:
  number` (default **5**, range `MP_MIN…MP_MAX` = 1…64, the ceiling shared with the JPEG
  and `ARTBOARD_MAX_PIXELS`). Fingerprinted **only when `scaleToMegapixels` is true**
  (F9) — the pinned defaults fingerprint `36232c04` does not change.
* Applies in `content` mode only: a preset/custom artboard already fixes the px (and the
  dialog already shows its MP). In a pinned mode the checkbox is disabled with the note
  `the pinned size decides the megapixels`.
* The JPEG is untouched (F10): it still renders at `jpegMegapixels` with the artboard's
  ratio; the MP target is about the vector's artboard, which is what the stock measures.
* Record: `tools.artboard = { mode, width, height, megapixels, scaledTo: N | null, passes }`
  in `export.json`; the row's settings line gains `· artboard 5 MP` when on; the batch
  log line names it once per run.

### D6 — What stays as it is

The stroke setting's number is still written verbatim (SOR §2 "the number in the setting
is the number in the file", 2026-10-08) — D3 keeps it so even under a scale. `fitArtboard`'s pinned behaviour (centre, never stretch, never
crop) is unchanged; only the bounds it receives are now the shipped ones. The EPS subset,
the Inkscape converter, the expander and the stroke unification are untouched.

## 4. UI (export settings dialog)

New file `src/upload/UploadArtboardSettings.tsx` (the artboard block moved out of the
dialog, F11, plus the new row):

```
Artboard   [Fit the artwork ▾]            hugs the artwork — padding a share of its largest side
           [x] Scale to [5   ] MP          the artboard (icon + padding) is scaled to this area
```

| Control | testid | Notes |
|---|---|---|
| checkbox "Scale to … MP" | `upload-set-mp-scale` | disabled in preset/custom modes; `Marker` field `scaleToMegapixels` |
| number, 1–64, step 0.1 | `upload-set-mp-target` | disabled when the box is off; `Marker` field `artboardMegapixels` |
| hint | `upload-set-mp-note` | content mode: `the artboard (icon + padding) is scaled to N MP · strokes keep their px`; pinned: `the pinned size decides the megapixels` |

Existing testids (`upload-set-artboard`, `-note`, `-w`, `-h`, `-ratio`, `-mp`) keep their
names and behaviour. Overrides, undo and "N fields overridden" follow the existing
`FIELDS` list (`settings.ts:231`) — the two new keys are appended there, so the hand-kept
copy problem of 2026-10-08 cannot recur.

## 5. Owner files (RULE 18 ideals; new files ≤ 300, functions ≤ 30 lines, params ≤ 4)

| File | Change | Size after (≈) |
|---|---|---|
| `src/lib/upload/epsdoc.ts` | `[…] concat`; `verifyEps` runs `checkPostScript` | 150 |
| `src/lib/upload/eps.ts` | `emitShape`: fill+stroke via `gsave…grestore`; unpainted shape emits nothing | 200 (+8) |
| `src/lib/upload/epscheck.ts` **new** | the subset stack checker (`tokenize`, `OPERATORS` table `{ pops: Kind[] }`, `checkPostScript`) | ≈ 120 |
| `src/lib/upload/prepare.ts` | two phases: `normalise(root, settings)` + `place(...)`; the artboard rect always; `tools.artboard` facts in `PreparedSvg` | ≈ 190 (artboard helpers move out) |
| `src/lib/upload/place.ts` **new** | `placeArtwork(normalised, want): Placed` — the clone-bake-measure loop (D3), `insideArtboard`, `centreOn` | ≈ 130 |
| `src/lib/upload/geom.ts` | `fitArtboard(bounds, pct, target)` where `target: PinnedSize | MegapixelTarget | null`; `megapixelFit` (content fit × k) | +25 |
| `src/lib/upload/artboard.ts` | `MP_TARGET_DEFAULT = 5`, `clampMegapixels`; `artboardTarget(settings)` → the fit target | +20 |
| `src/lib/upload/settings.ts` | fields, defaults, clamp, overrides, `FIELDS`, fingerprint (appended only when on) | +12 |
| `src/upload/UploadArtboardSettings.tsx` **new** | `ArtboardSetting`, `CustomSize`, `MegapixelRow`, notes | ≈ 120 |
| `src/upload/UploadSettingsDialog.tsx` | imports the block | ≈ 175 (−65) |
| `src/upload/exportrecord.ts`, `src/lib/upload/export.ts` | `tools.artboard` | +10 |
| `src/upload/exportvalidate.ts` | built-in EPS: `checkPostScript` before commit | +6 |
| `src/upload/UploadRow.tsx`, `uploadlog.ts` | `· artboard N MP` | +4 |
| `tests/helpers/psrun.ts` **new** | test-side helper: runs `checkPostScript` and also *executes* the subset (tracks the CTM and the painted bounding box) so a test can assert "every painted point lies inside the %%BoundingBox" | ≈ 100 |

`src/lib/upload/` is already a concept folder with `geom/`, `epsconv/`; two new files keep
`prepare.ts` and `eps.ts` under their ideals instead of growing them.

## 6. TDD steps (each: red tests → code → `npx tsc --noEmit` · `npm run lint` · `npm run quality:changed`)

**Commit A — `fix(upload): the built-in EPS is an executable PostScript program`**

1. `tests/upload_epscheck.test.ts` (red): `checkPostScript("0.75 0 0 -0.75 0 750 concat")`
   → `["line 1: concat expects an array, found number"]`; `[0.75 0 0 -0.75 0 750] concat`
   → `[]`; `fill` then `stroke` with no path in between → `["line N: stroke has no current
   path"]`; unbalanced `gsave`; leftover operands; an unknown operator.
2. `tests/upload_eps.test.ts` (red): the pinned line **changes** to
   `toContain("[0.75 0 0 -0.75 0 69.6] concat")` and a new assertion: no line of any
   produced EPS ends in `concat` without a `]` before it; a `fill="#f00" stroke="#000"`
   rect emits `gsave 1 0 0 setrgbcolor fill grestore … stroke`; an unpainted shape emits
   no `newpath`; `verifyEps` fails an EPS whose body has the bare-number concat (so the
   commit gate catches a regression); `tests/helpers/psrun.ts` executes every fixture EPS
   with zero errors and every painted point inside `%%HiResBoundingBox`.
3. `tests/upload_runexport.test.ts` (red): a package exported through the real pipeline
   (built-in converter) has an EPS that `checkPostScript` accepts; a doctored EPS stage
   output with a bare `concat` ends the row `partial` with the reason naming the line.
4. Green: D1 code. Docs: SOR §"EPS writer" + I-61; QUALITY_RECHECK honesty note that the
   old test pinned the defect.

**Commit B — `fix(upload): the artboard is the shipped artwork — measured after strokes and expansion`**

5. `tests/upload_prepare.test.ts` (red, the F4 reproduction): source stroke 1 px,
   `strokePx: 8`, padding 0 → the viewBox equals the bounds of the **final** DOM
   (re-measured by `visibleBounds` on the output) to 3 decimals, and
   `insideArtboard(output)` holds; same with `expandStrokes: true` (miter corners);
   same with padding 8 % (box = final bounds + pad on each side); a pinned 512×512
   artboard with scale < 1 and verbatim 6 px strokes → nothing outside, centred within
   0.01 px; `passes` is 1 when `strokePx = 0`.
6. `tests/upload_prepare.test.ts` (red, D4): transparent background → first child is
   `<rect x=0 y=0 width=artW height=artH fill="none" stroke="none">`; colour background →
   the filled rect; `tests/upload_optimize.test.ts`: the invisible rect survives SVGO;
   `tests/upload_clean.test.ts`: the clean-code report does not flag it;
   `tests/upload_eps.test.ts`: the EPS of that SVG has no unpainted path and its
   bounding box is the artboard.
7. `tests/upload_runexport.test.ts` (red): end to end, `export.json` carries
   `tools.artboard = { mode: "content", width, height, megapixels, scaledTo: null, passes }`
   and the SVG's viewBox equals `width height`.
8. Green: D2/D3/D4 code (`place.ts`, `prepare.ts` split). Docs: SOR I-60 + the "export
   SVG copy" rows; `prepare.ts` header comment rewritten for the two phases.

**Commit C — `feat(upload): scale the artboard to N megapixels`**

9. `tests/upload_settings.test.ts` (red): defaults `scaleToMegapixels=false`,
   `artboardMegapixels=5`; clamp 1…64 and junk → 5; fingerprint of the defaults is still
   `36232c04`; turning the box on changes it; overrides count the two fields.
10. `tests/upload_geom.test.ts` (red): `fitArtboard(bounds, 8, { megapixels: 5 })` →
    `artW·artH = 5e6` within 1e-6 relative, aspect = the padded content fit's, scale
    = k; a 0-area bounds does not divide by zero.
11. `tests/upload_prepare.test.ts` (red): a 100×50 icon, padding 0, 5 MP, strokes
    expanded → viewBox `0 0 3162.278 1581.139`; the same with verbatim 2 px strokes and
    expansion off → area within 0.01 % of 5 MP, `stroke-width="2"` still in the file,
    `insideArtboard` holds, `passes ≤ 4`; in `preset` mode the MP setting is ignored
    (the pinned px win) and the record says `scaledTo: null`.
12. `tests/upload_eps_settings_ui.test.tsx` (the settings-dialog UI file; red): the new row renders in content mode,
    is disabled with the pinned note in preset/custom; typing 10 stores 10; the override
    marker and the undoable bulk apply include it; `upload-set-mp-note` text.
13. `tests/upload_runexport.test.ts` + `tests/upload_ui.test.tsx` (red): an export with
    the box on writes `tools.artboard.scaledTo: 5` and `megapixels: 5`; the row's
    settings line reads `· artboard 5 MP`; the JPEG size still follows `jpegMegapixels`.
14. Green: D5 code + `UploadArtboardSettings.tsx`. Docs: SOR storage/settings table,
    UI_SELECTORS (three testids), README batch table, I-62, docs/README row flip to
    "shipped", QUALITY_RECHECK entry, `npm run verify` on the final commit.

Each commit ends with the RULE 16 gate and a RULE 18 re-read of every touched file.

## 7. Invariants to add to the SOR

* **I-60 — the artboard is the shipped artwork.** The viewBox is computed from the
  bounds of the *final* DOM (verbatim strokes, expansion, joins and caps included), plus
  the padding; nothing visible lies outside it; the artboard rect is always the first
  child (background colour, or invisible when transparent). A pinned artboard centres the
  shipped bounds exactly.
* **I-61 — the built-in EPS is executable.** Every `concat` takes an array; a shape with
  both paints fills inside `gsave…grestore` before it strokes; an unpainted shape emits
  nothing; `verifyEps` and the commit gate run the subset stack checker, so a program
  that would raise `/typecheck` is a `partial` row, never a file.
* **I-62 — "scale to N MP" scales the artboard, not the JPEG.** On, in content mode only:
  the content fit is scaled uniformly so `artW·artH = N·10⁶` (within 0.01 %; exact when
  the artwork is all fills), strokes keep the verbatim px, the record carries
  `tools.artboard.scaledTo`, the JPEG keeps `jpegMegapixels`.

## 8. Risks and how the design meets them

| Risk | Answer |
|---|---|
| The D3 loop does not converge for a pathological artwork (a huge miter on a tiny shape) | 4 passes max; the last pass is re-measured and re-centred, and `insideArtboard` is **checked**: if it still fails, `prepare` fails honestly (`unsupported: the artwork's strokes do not fit the artboard at this scale`) instead of shipping a spill |
| An invisible rect is rejected by some stock's checker | The user chose it knowingly ("it does not matter here"); the row's clean report names it (`artboard rect: invisible`), so a later "no rect when transparent" switch is one setting away — recorded as an open point, not built now |
| Changing the viewBox marks existing packages stale | Only through the fingerprint: the MP fields are appended only when on; B changes **output**, not settings, so existing packages are *not* marked stale — the row's "Stale" comes from `source.fingerprint`, unchanged. Users re-export when they want the fix (documented in the README batch table) |
| Repeated bakes degrade coordinates | Every pass bakes a clone of the ONE normalised DOM (F7) |
| The PostScript checker rejects a valid program it does not understand | It judges only the built-in writer's output; `verifyEpsDocument` (Inkscape) is untouched |

## 9. Open points (answer any time; defaults in bold)

* **Q1** The invisible artboard rect when the background is transparent: **always** (as
  answered), or behind a setting? Default: always, reported in the clean line.
* **Q2** MP target step in the dialog: **0.1 MP**, or whole MP?
* **Q3** Should a `preset`/`custom` artboard **also** report `megapixels` in
  `tools.artboard` (it will — it is free), and should the row line show it there too?
  Default: record yes, row line only when the MP box is on.
