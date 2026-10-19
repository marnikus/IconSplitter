# AI source regeneration — fix: broken row, invisible dialog, silent run

2026-10-19 · status: designed before the fix (TDD: every test below RED first); shipped the same day.
Follows `archive/2026-10-16-image-regen/README.md` (never edited — RULE 17).

## 1. The report

1. Screenshot of a Generate SVG row: the row's **Regenerate / ⚠ / ✓ / ✕** stack
   vertically under the checkbox on a second line, and **◍ Regenerate image**
   is stretched across the last column.
2. "regenerate image do nothing. freezed button and no errors or warnings."

## 2. Root causes (each verified in the code)

| # | Cause | Effect |
|---|---|---|
| RC1 | `svg-row-image-regen-{id}` was added as a **9th direct child** of `.svg-row`, whose grid declares **8 tracks** (`34px max-content minmax(280px,1fr) 122px 118px 130px 158px 210px`, the same as `.svg-columns`) | the button takes the 210px decision track; `DecisionActions` wraps into an implicit second grid row, column 1 (34px) — exactly the screenshot |
| RC2 | `SvgImgConfirm` rendered a bare `.svg-modal` — **no `.svg-backdrop`** (the fixed, `inset: 0`, `z-index: 20` overlay every other dialog uses). `.svg-modal` has no position of its own and `PanelDialogs` mounts after the list and the footer | the dialog lands in normal flow **below the whole list**, off-screen. While it is "open", `SvgHotkeys` stops every list key ("a dialog is modal") — the frozen feel. jsdom does no layout, so the UI test clicked the hidden dialog and passed |
| RC3 | after **Generate now** the dialog closes and nothing shows a run: no busy, no row state, no start toast; results are recorded only after the WHOLE batch | an image takes 20–120 s; the screen looks idle the whole time |
| RC4 | `void confirmOf(…)`: a throw after the network (folder/file/pair-file write) is an unhandled rejection; the failure toast drops the reason; HTTP errors drop the router's `error.message`; a timeout reads "signal is aborted without reason". Found while writing the RED test: an HTTP 400 was recorded as a failed entry but toasted **"Regenerated 1 AI source — new main version"** — every recorded entry was counted as done | "no errors or warnings" even when something failed — and a success toast for a failure |
| RC5 | a pair with **no pair file yet** (never generated): `recordResult` returned `null` before writing | the paid-for image was discarded, counted as an unexplained failure |
| RC6 | image writes never updated `refs.metas` — the copy `runbatch.saveOne` starts every SVG save from. Found while implementing: even with the copy kept in step, an image result landing WHILE an SVG file is written (between the save's read of the copy and its write) was overwritten | the next SVG generation rewrote the pair file from the stale copy and **dropped `imageVersions`/`imagePreferred`** (both proven by RED tests) |
| RC7 | the image request used the SVG stall window (default 120 s) as a **total** limit, but a non-streamed image arrives in one piece at the end | slow (high quality / large) images are cut at 120 s |
| RC8 | `composite.ts` reads `source.relPath` — always the ORIGINAL AI image | the row shows the new main as "AI SOURCE", but Generate SVG vectorizes the old file — against the request "output image will replace the current AI source image" |

## 3. Decisions

* **D1 — the row keeps its 8 cells.** As shipped (§7): `◍ Regenerate image`
  sits in the decision cell under the vector buttons (the owner's parallel
  fix) and reads `◍ Regenerating…`, disabled, while its row is in flight; the
  strip `svg-ai-bar-{id}` inside the pair cell, under the previews, holds the
  in-flight marker, the version chips and the last failure — only when one
  has something to show. `contain: inline-size` keeps it from widening the
  `max-content` preview column (it fills the pair's width and wraps).
* **D2 — one dialog shell.** `SvgImgConfirm` = `.svg-backdrop` >
  `section.svg-modal[role=dialog][aria-modal=true]` > head (title + Cancel) >
  body — the `SvgConfirm` structure. As shipped (§7) the body is the owner's
  roomy layout (controls first, the prompt last at full width, fitted to its
  text, Generate pinned) plus this fix's wait-limit field, the capability note
  as `svg-img-caps`, and a Generate disabled on a blank prompt.
* **D3 — a visible run.** Model field `imgRunning: string[]` (one writer: the
  batch). The busy pill reads `Regenerating AI sources · done/total` and
  advances per result (RULE 2/5); a start toast names the connection; rows
  in flight show `◍ Regenerating…` (disabled) + a mini bar; the bulk button
  is disabled while a batch runs and **■ Stop images** (`svg-img-stop`)
  appears. Each result is recorded the moment it lands (runner `onResult`),
  so its row switches to the new main at once (RULE 24).
* **D4 — stop, honestly (RULE 7).** Stop starts no new request; requests
  already sent finish and are saved (an uncertain outcome is never resent).
  The outcome separates regenerated / failed / not sent.
* **D5 — nothing silent (RULE 2/4).** The run is wrapped end to end: every
  per-row failure is caught, counted and logged with its reason; the final
  toast names the first reason; busy and the in-flight marks always clear.
  HTTP failures reuse `classifyHttp` (the router's own message); a timeout
  says "no answer within N s — nothing was saved". The row strip shows the
  last attempt's failure (`svg-ai-error-{id}`, read from the pair file).
* **D6 — every pair can be regenerated.** No pair file → the record starts
  from `metaForSource` (I-41). An unreadable pair file is refused before
  anything is sent (I-43: never overwritten).
* **D7 — one in-memory truth, field ownership.** Every image-side pair-file
  write also sets `refs.metas`, memory first (as `runbatch.persist` does), and
  `runbatch.persist` takes the image fields from the LATEST in-memory copy
  (`withImagesOf`): the image fields belong to the image writer, so no SVG save
  built from an older copy can drop a regeneration.
* **D8 — the main image IS the source.** `buildComposite(root, sources,
  imageOf)`; the run and the confirm preview resolve each source through
  `mainImageOf(meta, relPath)` (the chosen done version, else the original).
  Image requests wait at least 300 s (`imageWaitMs`), shown in the dialog.

## 4. TDD plan (RED first)

1. `tests/svgimgreg.test.ts`: `imageWaitMs` floor, `lastImageFailure`,
   `mainImageOf`, `regenOutcome` texts.
2. `tests/imgrunner.test.ts` (new): `onResult` per landed item, the router's
   message on HTTP errors, timeout and network texts, Stop sends nothing new.
3. `tests/svg_runner.test.ts`: the run's composite resolves the main image.
4. `tests/svg_imgreg_ui.test.tsx` (real runner, fetch stubbed): 8 row cells
   with the decision cell last and the strip contract; the dialog is a
   `.svg-backdrop` overlay; in-flight busy/marker/Stop then the landed main;
   HTTP and disk failures are reported (toast + row line), never silent; a
   pair without a file gets one; an SVG generation after a regen keeps the
   image history and vectorizes the new main.

## 5. Owner files (as shipped)

`svg/imgactions.ts` (guard, one-run confirm, Stop, main switch AND the run —
238 lines, one owner) · `svg/imgrunner.ts` · `svg/SvgThumbs.tsx`
(`AiSourceBar`, the strip, beside the pair it belongs to) ·
`svg/SvgImgConfirm.tsx` (the owner's layout + this fix's fields) ·
`lib/svgimgreg.ts` (`mainImageOf`, `withImagesOf`, `imageWaitMs`,
`lastImageFailure`, `regenOutcome`) · `svg/composite.ts` + `runbatch.ts` +
`SvgConfirmPager.tsx` (resolver, field ownership) · `statemodel.ts`
(`imgRunning`) · `SvgRow` (the in-flight state on the decision-cell button) /
`SvgBulkBar`/`SvgPanel`/`panelbits` wiring · `index.css`. Drafted as three new
`src/svg` files (strip, run, fact tile); folded into their owners instead —
`src/svg` already holds 68 files, far over the RULE 18 module ideal, so this
fix adds none.

## 6. Records

The SYSTEM_OF_RECORD invariant for the AI source's versions was numbered I-69
on 2026-10-16 — an ID already taken by "batch render identity". It is
renumbered **I-71** and now carries the binding rules of D1–D8.

## 7. Integration with the owner's parallel commits (same day)

While this fix was being built, six commits landed on the branch from the
owner's side (`ca1f7d6`…`9262499`): the row button moved into the decision cell
behind a `.svg-decision-sep` with the Regenerate look; the dialog got the
`.svg-backdrop` shell and a roomy reading layout (`tests/svg_img_confirm_layout`);
the old confirm got a `.catch` and a start toast; `AGENTS.md` gained the "push
when finished; never force" rule; and the wire became image EDIT —
`POST images/edits` with the prompt AND the row's current main image as the
reference (`lib/svgimgedit`, `archive/2026-10-19-image-regen-reference`). This
fix was rebased onto them — twice, never forced: their placement, dialog
layout, edit wire and tests are kept as the owner's choices. On top: the
in-flight state on their button; the strip (in flight, chips, last failure)
without a second button; the wait/caps/blank-prompt fields in their dialog; the
runner's `onResult`/Stop/named failures over their edit wire (the reference is
`mainImageOf` — the file the row shows and the SVG generation reads); their two
runner-mock UI tests ported to the real wire, my runner tests merged into their
`tests/svg_imgrunner.test.ts`; and everything from RC3 to RC8. Their entries
noted `verify:fast` could not run on their machine; the full suite here covers
the combined tree.
