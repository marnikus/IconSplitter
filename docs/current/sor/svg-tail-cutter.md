# Tail cutter (2026-11-06)

[Generate SVG](svg-generation.md) · [path editor](svg-path-editor.md)

Generated icons often have a line whose **open end pokes a little past
another line** — a short *tail*. The tail cutter finds them and trims each line
exactly at its crossing.

## Algorithm (`lib/tailcut.ts`, pure)

- Every drawn shape is read (`pathedit/svgdoc`, `objects`); only **open**
  subpaths have ends — circles, rects and closed paths are never cut.
- From each open end it walks inward (curves flattened in 32 steps) only as far
  as the tolerance, and tests that walk against the lines around the end (a
  spatial grid; the end's own nearby segments excluded, far parts of the same
  path included).
- The first crossing within **tolerance** (the icon's own units — viewBox px) of
  the end makes a tail; an end lying exactly on a line is not one.
- `cutTails` trims at the crossing (a curve is split there, so its shape is
  kept; both ends of one line can be cut) and rewrites only the cut shapes in
  one pass (`svgdoc.withPathDs`; a `<line>` becomes a `<path>`).
- Speed (`tailcut_speed.test.ts`, measured): a typical icon review + cut
  ≈ 0.6 ms; 400 shapes with 50 tails ≈ 12.5 ms (was 70 ms before the grid and
  the one-pass write); review + cut + save of one icon < 10 ms.

## In Generate SVG

| Control | Behaviour |
|---|---|
| **✂ Cut tails** (bulk bar) | Checked rows only, never a row being generated. Auto-cut: cut at once; otherwise review: tails highlighted on the row preview, nothing written |
| **✓ Approve cuts (n)** (bulk bar) | Cuts the checked rows that were reviewed and have tails |
| **✂ Approve cut (n)** / *no tails* (row, beside ✎ Edit) | Cuts that row |
| **🙈 Hide / 👁 Show highlights** (bulk bar) | Hides the highlight boxes on every row for this session; reviews and their Approve buttons stay |
| **⚙ Cutter algo** | Tail tolerance (icon px, 0.5–500, default 10), highlight colour, highlight padding (screen px, 0–60, default 6), cut automatically (default off) — `iconSplitter.svg.tailCut.v1` |

Each run / approve is **one undo step** across all its files (`svgEdit` entry
with `files`, `svgedit.saveSvgEdits`). An approve re-reads the file and
re-detects if it changed since the review. A highlight (`tailcut/tailmarks.ts`,
2026-11-09) is a small square on the line's open END only, plus the tail itself
laid over its own line in the highlight colour from the end to the crossing —
exactly what a cut removes (`Tail.tip` / `Tail.path`). It is drawn in the preview only, while the file is exactly what was
reviewed, and is never written. Shapes are read in their own coordinates (transforms are
not applied).

## In the full-screen edit mode (2026-11-09)

[Path editor](svg-path-editor.md) top bar: **🙈 Hide highlights**, **⚙ Cutter algo**
(same settings and hide switch as above) and **✂ Cut tails** (highlight; with
cut automatically, cut at once) and **✓ Apply (n)** beside it (on while tails are highlighted). On the open artwork, unsaved edits included:
**Ctrl+J** highlights every tail, **Ctrl+L** cuts the highlighted ones into the
session (`useEditorTailCut`) as **one history step**: Ctrl+Z puts the tails back
(and highlights them again), Ctrl+Shift+Z cuts again. **Finish edit** writes it
(one global undo step), Cancel drops it. An edit after a highlight hides it and
Ctrl+L asks for Ctrl+J again. Handles `<testid>-cut-{hide,settings,run,apply,note}`; test
`pathedit_tailcut.test.tsx`.

Handles: `svg-cut-run`, `svg-cut-hide`, `svg-cut-approve`, `svg-cut-settings`,
`svg-cut-settings-dialog`, `svg-cut-tolerance`, `svg-cut-color`,
`svg-cut-padding`, `svg-cut-auto`, `svg-cut-approve-<id>`, `svg-cut-none-<id>`.
Tests: `tailcut_core.test.ts`, `tailcut_speed.test.ts`, `tailcut_ui.test.tsx`.
