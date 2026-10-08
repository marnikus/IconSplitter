# Exact stroke width in the shipped SVG — design (2026-10-08)

Status: design approved for implementation; no code yet. Follows the
`docs/current/` rules; the TDD table in §6 is the implementation contract.

## 1. The problem, measured against the code

The user set a stroke width of **2** and the shipped file reads
`<path stroke-width="2.6224000000000003" …>`. Two independent faults:

**F1 — the width is finalised BEFORE the scaling is resolved, then rescaled.**
`prepare.ts` writes each stroke in the shape's LOCAL units: `widthPx / k /
fit.scale`, where `k` is the artwork's own CTM scale (a `<g transform="scale(1.1)">`)
and `fit.scale` the artboard's. It then wraps the artwork in
`<g transform="translate(…) scale(…)">`. SVGO's `applyTransforms` (part of
`convertPathData`, preset-default) later bakes those transforms into the path
data and **multiplies `stroke-width` by the baked scale with raw float
arithmetic** (`Number(num) * scale`, `plugins/applyTransforms.js:109`):

```
local 2.384 × 1.1  = 2.6224000000000003     ← the user's file
local 2.4   × 1.1  = 2.64                   ← after today's 10 % tidy: still not 2, still not 2.667
```

Reproduced through `prepareExportSvg` → `optimizeSvg` with a `scale(1.1)` group
(content and 512 px artboards alike). The user's diagnosis is correct.

**F2 — the setting is in pt, the user thinks in px.** The field is "Stroke width
(pt)"; 2 pt = 2.667 px at 96 DPI, so even a perfectly tidy export would write
`2.7`, never `2`. The user's acceptance criterion (asked 2026-10-08): *"the
number in the preset must be the number in the SVG — 2 means I see 2."*

Why neither of the obvious fixes works: a width written under a transform can
never read `2` once the transform is resolved. Forbidding SVGO from baking
(`applyTransformsStroked: false`) leaves `stroke-width="1.818"` under a
`transform="scale(1.1)"`; a final tidy pass after SVGO writes `2.6` or `2.7`.
The only design that meets the criterion: **resolve every transform into the
geometry first, then write the width verbatim.**

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Bake geometry in prepare.** Every shape's coordinates are rewritten in artboard px (`F × CTM`, `F` = the artboard translate+scale); no `transform` attribute survives anywhere; no wrapper group. | The shipped file's units ARE the artboard's px; SVGO has nothing left to bake, so it cannot touch a width. RULE 3: prepare is the one owner of geometry and stroke. |
| D2 | **Stroke width is set AFTER the bake, verbatim:** `stroke-width="2"` for a setting of 2 (`fmt`, ≤ 3 decimals, which a typed value already satisfies). `tidyStrokeWidth` and `STROKE_TIDY_TOLERANCE` are deleted with their tests — no caller, no "within 10 %" drift any more. | The number in the setting is the number in the file. |
| D3 | **Setting unit is px:** `strokePt` → `strokePx`, label "Stroke width (px)", range 0–32, step 0.1, `clampStrokePx`. **Stored values carry the NUMBER over unchanged** (`strokePx: raw.strokePx ?? raw.strokePt`): the user's "2" was always meant as 2 px. | User's choice. The fingerprint is positional and the number is unchanged, so no export flips to `stale` by the rename alone. |
| D4 | **Stroke width 0 = artwork's own, scaled honestly:** the artwork's width × the baked scale `k`, written `fmt` (3 decimals), never tidied. Dash arrays/offsets scale by `k` the same way for every stroked shape. | "Untouched" means the picture, not the digits; baking is unconditional, so a width must follow its geometry. |
| D5 | **Element types survive when the matrix allows it:** `rect`/`ellipse`/`line`/`polyline`/`polygon` keep their element under an axis-aligned matrix (`b = c = 0`, positive scale), `circle` under a uniform one; anything rotated/skewed becomes a `<path>` from the shared outline. | A stock `<circle>` stays a `<circle>`; a rotated one is still exact. |
| D6 | **Fail closed, named (RULE 15), when a bake would change the picture:** a STROKED shape under a non-uniform or skewed matrix (its stroke is anisotropic in the source — no single width is faithful); a rounded `rect` (rx/ry) under rotation/skew; any `userSpaceOnUse` gradient/pattern, `clipPath`, `mask` or `filter` (their coordinates would need baking too). Reported as `unsupported: <reason>` like today's text/image/use. | Never guess at geometry. The userSpaceOnUse case is a known narrowing (such files exported before); composing `gradientTransform` is the follow-up if it ever bites a real icon. |
| D7 | **One outline model, two writers.** `epspath.ts` already compiles every shape and the full path grammar to absolute move/line/cubic/close ops — welded to PostScript text. The model moves to `geom/outline.ts` (+ `transformOutline`, + the SVG `d` writer); `epspath.ts` keeps only the PostScript writer. EPS output is byte-identical (pinned by the existing EPS tests). | RULE 3: the bake and the EPS cannot disagree about what a shape is. |
| D8 | No new clean-policy rule (user's choice): the invariants "no `transform` in the shipped file" and "`stroke-width` equals the setting after SVGO" are pinned by tests, including one through `optimizeSvg`. | — |

## 3. Design by owner (RULE 1/3/18)

### 3.1 `src/lib/upload/geom/outline.ts` (new, ~190 lines; ideal-size reason: the path grammar is one table)
* `interface Outline { ops: OutlineOp[] }`, `type OutlineOp = {op:"M"|"L",x,y} | {op:"C",x1,y1,x2,y2,x,y} | {op:"Z"}`.
* `shapeOutline(el): Outline | null` — rect (no rx/ry), circle, ellipse, line, polyline, polygon, path (moved from `epspath.ts`; the `PsCursor` becomes an `OutlineCursor` with the same smooth-control bookkeeping; arcs → cubics via `arcCenter`, quads → cubics).
* `transformOutline(o, m): Outline` — every point through `applyM`.
* `outlineToPathData(o): string` — `M x y L … C … Z` with `fmt` (3 decimals), absolute commands only.

### 3.2 `src/lib/upload/epspath.ts` (243 → ~60)
* `shapePathPs(el)` = `outlineToPs(shapeOutline(el))`; `pathDataPs(d)` likewise. The circle loses its PostScript `arc` operator and becomes four cubics like the ellipse (the standard KAPPA split, max radial error 0.027 %), so ONE writer serves every shape; `tests/upload_eps.test.ts:129` (`"10 10 4 0 360 arc"`) is the one pinned expectation that changes, to four `curveto`s, with this reason. Rounded rects stay outside the subset (unchanged).

### 3.3 `src/lib/upload/geom/bakeshape.ts` (new, ~90)
* `bakeShapeAttrs(el, m): boolean` — D5: rewrites the element's own attributes in place when the matrix allows (rect x/y/width/height/rx/ry; circle cx/cy/r; ellipse cx/cy/rx/ry; line x1…y2; points); returns false when the element must become a path.
* `isAxisAligned(m)`, `isUniform(m)` (rotation+uniform scale or reflection: `a=d ∧ b=-c` or `a=-d ∧ b=c`).

### 3.4 `src/lib/upload/bake.ts` (new, ~150)
* `bakeGeometry(root, fit): { baked: number; unsupported: string[] }` — one walk with the CTM (`parseTransform`/`multiply` from `geom/matrix`), starting from `F = translate(offsetX, offsetY) · scale(scale)`; for each shape: `bakeShapeAttrs` or replace with `<path d=…>` carrying the element's presentation attributes; scale `stroke-dasharray`/`stroke-dashoffset` and — when the stroke setting is 0 — the resolved `stroke-width` by `scaleOf(m)` (D4); remove every `transform` attribute (shapes and groups). D6 checks first and returns the reasons without touching the tree.
* `bakeVetoes(root)` — the D6 list (userSpaceOnUse paint servers, clipPath/mask/filter elements).

### 3.5 `src/lib/upload/prepare.ts` (198 → ~175)
Flow: parse → veto → `cleanExportDom` → `visibleBounds` → `fitArtboard` → **`bakeGeometry`** (unsupported → `fail("unsupported", …)`) → `restyleStrokes(root, { widthPx: strokePx, color })` with `k` always 1 (the `scaleOf(hit.ctm)` division goes) → `applyArtboard` = viewBox + background rect only (the wrapper group goes). `PreparedSvg` gains `shapesBaked: number`. `setStrokeWidth` writes `fmt(width)`.

### 3.6 `src/lib/upload/settings.ts` (242 → ~245)
`strokePx`, `STROKE_MAX = 32`, `clampStrokePx`, the alias read in `normalizeSettings` and the override field table (`strokePt` accepted on read only, never written), doc comment "px in the file's own units". Fingerprint position unchanged.

### 3.7 UI (`UploadSettingsDialog.tsx`, `UploadRow.tsx`)
Label "Stroke width (px)", hint "0 = leave the artwork's strokes untouched · the number you type is the number in the file"; row cell "2 px". Handles unchanged (`upload-set-stroke`, `upload-set-marker-stroke`).

### 3.8 Deletions
`tidyStrokeWidth`, `STROKE_TIDY_TOLERANCE` (+ `tests/upload_stroke.test.ts` tidy cases), `ptToPx`/`pxToPt` if no caller remains (`geom.ts` "Units" comment rewritten: user units are px; pt is not a unit this feature speaks).

## 4. User-visible changes (→ `SYSTEM_OF_RECORD.md` §2 "SVG to upload")
* The stroke width setting is in **px** and the file carries exactly that number on every visible stroke; existing stored values keep their number.
* The shipped SVG has **no `transform` anywhere**: coordinates are the artboard's px. Shapes keep their element where the maths allows; rotated/skewed ones become paths.
* Width 0 still means the artwork's own strokes, now written in artboard px (× the baked scale, 3 decimals).
* New honest refusals (`unsupported: …`): a stroked shape under a non-uniform/skewed transform, a rotated rounded rect, userSpaceOnUse paint servers, clipPath/mask/filter.
* Gone: the "fewest decimals within 10 %" rule — superseded; the 2026-10-08 stock-clean entry stays as history.

## 5. Size budget (RULE 16 gate, RULE 18 ideals)

| File | Now | After |
|---|---:|---:|
| `geom/outline.ts` | — | ~190 (one grammar table; reason comment) |
| `epspath.ts` | 243 | ~60 |
| `geom/bakeshape.ts` | — | ~90 |
| `bake.ts` | — | ~150 |
| `prepare.ts` | 198 | ~175 |
| `settings.ts` | 242 | ~245 |
| `geom/stroke.ts` | 75 | ~55 |

Every new function aims at ≤ 20 lines, ≤ 4 params (a `BakeCtx {m, strokePx}` object, not positional flags), CC ≤ 10.

## 6. Implementation steps (TDD: red → green → `npm run quality:changed`)

| # | Red (test first) | Green (code) |
|---|---|---|
| 1 | `tests/upload_outline.test.ts`: shape → ops for each element; path grammar (relative, H/V, S/T smoothing, arcs → cubics, Z); `transformOutline` with rotation; `outlineToPathData` text (`M 1 2 L … C … Z`, 3 decimals) | `geom/outline.ts` |
| 2 | `tests/upload_eps.test.ts` stays green unchanged except line 129: the circle is four `curveto`s, not `arc` (reason in §3.2) | `epspath.ts` rewritten on the outline model |
| 3 | `tests/upload_bake.test.ts`: axis-aligned rect/ellipse/line/poly keep their element with rescaled attrs; uniform circle keeps; rotated rect → path; stroked shape under `scale(2 1)` → unsupported named; filled shape under the same → baked; dasharray × k; no `transform` left on any element; userSpaceOnUse gradient → unsupported | `geom/bakeshape.ts`, `bake.ts` |
| 4 | `tests/upload_settings*.test.ts`: `strokePx` default 0, clamp 0–32, `{strokePt: 2}` reads as `strokePx: 2`, fingerprint unchanged for the same number, overrides table | `settings.ts` |
| 5 | `tests/upload_prepare.test.ts`: `strokePx: 2` under a `scale(1.1)` group on a 512 artboard → `stroke-width="2"` on the path, no `transform` in the output, viewBox = artboard; width 0 → artwork `1.5` under scale(1.1) on a fit scale 4 → `6.6`; failures named; `shapesBaked` counted; existing tests updated from `strokePt` | `prepare.ts` |
| 6 | `tests/upload_runexport.test.ts`: full export of the same source with `optimizeSvg: true` → the FILE text contains `stroke-width="2"` and no `transform=`; EPS still verifies; JPEG dims unchanged | — (integration; should pass from 1–5; fix what it exposes) |
| 7 | `tests/upload_stroke.test.ts`: tidy cases removed; `tests/upload_ui.test.tsx`: label "(px)", cell "2 px" | `geom/stroke.ts` cleanup, dialog, row, `geom.ts` units |
| 8 | — | `npm run quality:changed`, `npm run verify:fast`, `npm run verify`; same-commit docs: SOR §2 bullets (stroke width, clean SVG, refusals), §6 storage row (`strokePx`, alias), §7 module rows (`outline.ts`, `bakeshape.ts`, `bake.ts`, `epspath.ts`); `UI_SELECTORS.md` label; `QUALITY_RECHECK.md` one appended entry; `docs/README.md` row; this doc §7 "as built" |

Commit: `fix(upload): exact stroke width — bake every transform into the geometry, then write the px setting verbatim` + `Verified:` line.

## 7. Risks and how each is closed

| Risk | Closed by |
|---|---|
| SVGO rewrites a width through some other path | Step 6 asserts on the FILE after SVGO; `applyTransforms` has nothing to bake when no `transform` exists |
| Baking changes the picture (rotation, skew, non-uniform) | Exact affine maths on cubics (an affine map preserves Bézier control points); stroked anisotropic cases refuse by name (D6) |
| EPS drifts from the SVG | Both read the same outline (D7); EPS tests pinned before the move (step 2 first keeps them green) |
| Files that exported yesterday now refuse (userSpaceOnUse, clip/mask/filter) | Named reason in the row; recorded here as the deliberate narrowing with its follow-up |
| 3-decimal coordinates on tiny artworks scaled up | Baking happens AT artboard px, so precision is applied once, in the final units — better than today (local 3 decimals × scale) |
| The user's stored `strokePt` meant pt after all | D3 carries the number; the dialog shows the unit; one edit fixes any icon |

## 8. As built (2026-10-08) — where the build departed from the plan

* **`bakeGeometry(root, matrix)`** takes no `strokePx`: the bake ALWAYS resolves
  each stroked shape's width × the baked scale onto the shape (and containers
  lose theirs), and prepare overwrites it when a setting exists. One rule,
  one less parameter.
* **`<pattern>`** joined the D6 refusal list (its content units are user space).
* **`vector-effect="non-scaling-stroke"`** keeps its number under the bake (it
  was already in final px) and loses the attribute.
* **Sizes landed:** `outline.ts` 269 (planned ~190 — the shape builders moved in
  with the grammar; reason comment on the file), `bake.ts` 110, `bakeshape.ts`
  94, `epspath.ts` 33, `prepare.ts` 202, `settings.ts` 246. `ptToPx`/`pxToPt`
  removed (no caller).
* **Tests:** the prepare suite was rewritten rather than patched — every former
  `g > rect` selector assumed the wrapper group; the export test asserts the
  SET of widths in the shipped text because SVGO legitimately hoists an
  identical width onto the group.

