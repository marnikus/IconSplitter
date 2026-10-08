# One stroke definition — design (2026-10-08, follow-up to the exact-width fix)

## 1. The problem

The reviewer's file:

```xml
<svg … stroke="#111" …>
  <g stroke="#000" stroke-width=".8">
    <path … stroke-width="2.6224…"/>
```

Three places define two properties: the root says `#111`, the group says
`#000` and `.8`, every shape repeats the width. The `.8` is dead (every child
overrides it); `#111` vs `#000` is an inconsistency a reviewer notices. The
user's rule: **a stroke property is defined ONCE, globally, on the root**; the
colour is `#000` (the stock standard for line icons); every other definition
goes.

Reproduced on the current code with `strokePx: 2`: prepare writes the width on
each shape, keeps the artwork's `stroke` on root and group, and SVGO hoists the
width onto the group — exactly the reviewer's picture.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Default stroke colour is `#000000`.** `artwork` stays selectable (keeps the artwork's own paints). | The user's rule; the file the user ships must read `stroke="#000"` without a setting change. Every stored default/override without the key reads `#000000`; the fingerprint changes, so previously exported icons re-export once. |
| D2 | **`unifyStrokes(root)` after the restyle** (new `lib/upload/strokeglobal.ts`): a stroke property (`stroke`, `stroke-width`) the visibly stroked shapes AGREE on is written **once on the root** and removed from every other element. Shapes that are NOT stroked carry `stroke="none"` when — and only when — the root now paints a stroke (otherwise they would inherit it). Containers never carry either property. | One definition, global, nothing shadowed. The background rect already carries `stroke="none"` for the same reason. |
| D3 | **When the shapes disagree** (`artwork` mode with mixed colours or, at width 0, mixed widths) the property lives **on each stroked shape**, explicitly, and on nothing else. | A single global value would change the picture; a definition on the shape that uses it is still "no useless definition anywhere". |
| D4 | `Stroke` (geom/stroke.ts) gains `paint`: the resolved stroke paint string. | The unify rule needs the paint in effect at each shape; the inheritance already computes it, it just did not keep it. |
| D5 | A property defined on the root only when at least one shape strokes visibly. | A filled-only icon gets no stroke definitions at all. |

## 3. Owner files

* `src/lib/upload/geom/stroke.ts` (+4): `paint` on `Stroke`.
* `src/lib/upload/strokeglobal.ts` (new, ~90): `unifyStrokes(root): { stroke: string | null; strokeWidth: string | null }` — what the root now carries, for the record and the tests.
* `src/lib/upload/prepare.ts` (+3): call after `restyleStrokes`, before `applyArtboard`; `PreparedSvg.globalStroke`.
* `src/lib/upload/settings.ts`: `STROKE_COLOR_DEFAULT = "#000000"`.
* UI/tests/docs: the default swatch, the row cell, SOR §2/§6/§7, UI_SELECTORS, QUALITY_RECHECK.

## 4. Steps (TDD)

| # | Red | Green |
|---|---|---|
| 1 | `upload_geom` stroke inheritance: `paint` resolved (`#000`, inherited, `none`, `currentColor`) | `geom/stroke.ts` |
| 2 | `upload_strokeglobal.test.ts`: unanimous colour+width → root once, nothing else, unstroked shapes `stroke="none"`; mixed colours → explicit per shape, root/containers bare; width 0 unanimous artwork width → root; no stroked shape → nothing written; group `.8` gone | `strokeglobal.ts` |
| 3 | `upload_settings`: default `#000000`; `upload_prepare`: the reviewer's document → one `stroke`, one `stroke-width`, both on root; `artwork` explicit where the old default was assumed | `settings.ts`, `prepare.ts` |
| 4 | `upload_runexport`: the SHIPPED text through SVGO has exactly one `stroke="#000"` and one `stroke-width="2"`, both on `<svg`, and no other colour | — |
| 5 | `upload_ui`: default swatch black | UI |
| 6 | gates, docs, commit | — |

## 5. As built (2026-10-08)

All five steps landed as designed. `unifyStrokes(root)` runs in
`prepareExportSvg` after `restyleStrokes` and before `applyArtboard`;
`PreparedSvg.globalStroke` carries `{ stroke, strokeWidth }` (null = per
shape, or nothing strokes). The reviewer's document ships through SVGO as
`<svg stroke="#000" stroke-width="2" viewBox="0 0 512 512">` with
`stroke="none"` on the two filled rects and no other definition of either
property. One test fixture changed meaning: a stylesheet width on an
UNstroked rect is dead by the new rule, so the fold test's rect now strokes.
The UI needed no code — the swatch row follows the settings default; only
the hint text changed.
