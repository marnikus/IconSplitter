# SVG version chips — pick the shown SVG straight from the row

2026-10-19 · status: implemented the same day (TDD: `tests/svg_version_chips.test.tsx`).

## 1. The request

> "like the idea of quick Image AI source selection with buttons above. Do
> same for SVG generated Preview. so it could be selected same way. do not
> remove old variant of selecting. but just add a new one. as feature."

The AI source already has one-click version chips (`svg-ai-chip-…`:
"original v1 v2"), shown in the strip of the pair cell. Picking which **SVG** version a row
shows still takes three steps: Versions → find the tile → "Use this version".
The user wants the same one-click chips for the SVG preview. The Versions dialog
stays exactly as it is.

## 2. What "selecting an SVG version" means today (verified)

- A row shows `shownVersion(row)` = `chosenVersion(versions, meta.preferred)`:
  the user's preferred version when it is usable, else the newest valid one
  (I-54). The preview, the `SVG vN` tag, Copy, Code, Location and the badge
  all read it, so they can never disagree.
- The dialog's "Use this version" calls `preferVersion(id, n)`
  (`svg/codeactions.ts`). That refuses an unusable version, writes `preferred`
  into the pair file (`saveMetaAt`), updates the row, logs `prefer-version`
  and toasts "Showing vN — all K versions are still there". A failure toasts
  and changes nothing.
- A version may be chosen only when it is `generated` and `validation.ok`.

So the new chips need **no new state or persistence**. They are a second
caller of `preferVersion`, the same single owner the dialog uses.

## 3. Design

- **Where:** the strip under the pair becomes two cells, side by side. Each cell
  is as wide as the preview above it, using the same flex gap as
  `.pair-thumbs`:
  - The AI cell holds the existing `AiSourceBar` (unchanged content and test ids).
  - The SVG cell holds the new `SvgVersionChips`.

  Each set of chips sits under the image it switches. A cell keeps a 96 px
  minimum, so chips stay readable at the smallest zoom. When neither side has
  anything to show, there is no strip.
- **Which chips:** one chip per usable version (`generated` + valid), labelled
  `vN`, in version order. Chips appear only when there are **two or more**
  usable versions, because a single version has nothing to switch to. Failed
  or invalid attempts get no chip: the dialog still lists them with their reason.
- **Active chip:** the shown version gets class `primary`,
  `data-active="true"` and `aria-pressed="true"`. Clicking it does nothing.
- **Click:** `stopPropagation()` so the row does not toggle activation, then
  `preferVersion(id, n)`. Toasts, the log line, persistence and refusals all
  come from that one owner.
- **Test ids:** `svg-ver-bar-{id}` for the cell and `svg-ver-chip-{id}-{n}`
  for a chip.

## 4. Steps

1. Write the failing test file `tests/svg_version_chips.test.tsx` (fixture
   `helpers/svgpanel.tsx`, three valid versions plus one failed):
   - chips for exactly the valid versions, with the shown one active;
   - a click switches the preview tag, the Copy version and the dialog's
     "shown" line, and persists `preferred` in the pair file;
   - one valid version shows no chips;
   - the failed version gets no chip;
   - the Versions dialog's "Use this version" still works (old path kept).
2. `SvgRowActions` gains `preferVersion`, wired in `panelbits.rowActionsOf`
   from `g.preferVersion`.
3. `SvgThumbs`: the `PairBars` strip, two width-bound cells, and
   `SvgVersionChips`.
4. CSS `.svg-pair-bars` / `.svg-pair-bar` next to `.svg-ai-bar`.
5. Docs: a selector row in `selectors/svg-generation-list.md` and a test line
   in `sor/tests/svg.md`.
6. Gates: focused tests, tsc, lint, `quality:changed`, `npm run verify`, a
   ledger entry, then commit and push.

## 5. Out of scope

- Approving or declining from a chip. Review stays in the decision cell, and
  approval follows the version being shown, exactly as before.
- Undo for the choice. The dialog's choice is not on the history timeline
  either. Both paths behave identically by construction.
