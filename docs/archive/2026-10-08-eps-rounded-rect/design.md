# EPS: `<rect> uses features outside the EPS subset` (2026-10-08)

## 1. The finding

A real export went `partial` with the EPS stage saying
`<rect> uses features outside the EPS subset`. The user's ask: fix it
automatically — scale/adjust whatever is needed so the EPS is correct, **no
distortion**, a warning that the file was fixed, **no manual confirmation**.

## 2. Root cause (measured)

* `geom/outline.ts` → `rectOutline` returns `null` for any `<rect>` carrying
  `rx` or `ry` ("rounded: outside the subset"). `shapePathPs` turns that null
  into the message above.
* Nothing upstream removes the corners: the bake keeps a rounded rect as a
  `<rect>` under an axis-aligned matrix (scaling `rx`/`ry` correctly), SVGO never
  drops `rx`, and the clean pass leaves geometry alone. So every icon with a
  rounded rectangle — a very common icon primitive — fails its EPS.
* The same gap made the bake REFUSE "a rounded `<rect>` under a rotation or
  skew": the outline model could not express it, so it could not become a path.

The message is misleading too: nothing is "outside" PostScript — a rounded
rectangle is four lines and four quarter-ellipses, which PostScript draws with
`curveto` exactly like the circles and ellipses the writer already emits.

## 3. Decisions

* **D1 — teach the ONE outline model rounded rects (RULE 3).** `rectOutline`
  follows the SVG spec: a missing radius copies the other; each radius is
  clamped to half the side; `0` is a plain rect (unchanged ops). The outline is
  `M L C L C L C L C Z` with KAPPA quarter-ellipses — the same approximation the
  model already uses for `<circle>`/`<ellipse>` and the one Illustrator itself
  uses, so there is **no distortion** and no scaling of anything: the shape is
  the shape. Every consumer of the model gains it at once: the EPS writer, the
  bake (`asPath`) and the bounds.
* **D2 — the bake veto goes.** A rotated/skewed rounded rect now becomes a
  `<path>` from the outline, like any other rotated shape; the refusal test
  becomes a conversion test.
* **D3 — the fix is reported, never confirmed.** The EPS result carries
  `fixes: string[]` (`"1 rounded <rect> written as an exact path outline"`).
  It travels: `Artifacts.epsFixes` → `export.json` `tools.eps.fixes` (additive,
  the tolerant parser ignores unknown keys) → `UploadRow.note` → a small
  `upload-note-{id}` line under the status badge (amber, not red: the package is
  `processed`) → the log's `exported` note → the batch toast's tail
  `· N EPS auto-fixed`. The row's `error` stays what it is: this is not an
  error.

## 4. Owner files

| File | Change |
|---|---|
| `src/lib/upload/geom/outline.ts` | `rectOutline` rounded corners |
| `src/lib/upload/bake.ts` | drop the rounded-rect veto |
| `src/lib/upload/eps.ts` | count rounded rects → `fixes` on the ok result |
| `src/upload/exportstages.ts`, `runexport.ts`, `exportcommit.ts` | thread `epsFixes` into `tools.eps.fixes` and the run result |
| `src/lib/upload/export.ts` | `tools.eps.fixes?: string[]` |
| `src/upload/rowmodel.ts`, `types.ts`, `statemodel.ts`, `UploadRow.tsx`, `exportactions.ts` | `note` on the row, the line, the log and the toast |

## 5. TDD steps

1. `upload_outline.test.ts` — rounded rect ops and exact path data; auto/clamp rules.
2. `upload_eps.test.ts` — rounded rect writes (4 `curveto`), `fixes` line; plain → `fixes: []`.
3. `upload_bake.test.ts` — rotated rounded rect converts instead of refusing.
4. `upload_runexport.test.ts` — the record carries `tools.eps.fixes`, the run result the note.
5. `upload_rowmodel.test.ts` + UI test — `row.note` from the record, the `upload-note-{id}` line.
6. SOR, UI_SELECTORS, README, QUALITY_RECHECK; `npm run verify`.
