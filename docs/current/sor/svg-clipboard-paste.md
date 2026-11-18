# Clipboard paste over a row preview (2026-11-17)

The user copies SVG code or a PNG image to the system clipboard — from anywhere:
the row's Copy button puts the shown SVG source there, a PNG arrives from the OS
or another app (the app adds no copy control of its own for previews) — and a
small **Paste** button in the bottom-right corner of each row preview writes it
over the file that preview shows. Owner: `src/svg/pasteoverwrite.ts`; the button
lives with the other corner control (the 🗑) in `src/svg/previewtrash.tsx`, and
the history side applies through `src/state/apply.ts` (`svgPasteOverwrite`).

* **Targets.** Base · Stroke → the base face file (`row.baseAiPath`); AI source →
  the main image file (`svgimgreg.mainImageOf` — the original or the accepted
  regeneration; the button rests while the preview has no image); SVG → the file
  of the version shown (`rowmodel.previewTargetOf`). A "No SVG" preview (no
  version yet) is the one paste that CREATES: the code is written under the
  canonical first-version name (`svgfile.svgNameFor(stem, 1)`) and recorded by
  the registration owner (`registerexisting.runRegisterFor` for that row alone)
  — same validation, numbering and toast as "Register existing SVGs".
* **What the clipboard must hold.** A PNG preview accepts only an `image/png`
  item (`clipboard.read()`); the SVG preview accepts only text
  (`clipboard.readText()`) and it must pass `svgvalidate.validateSvg` — the same
  gate a generated version passes. A wrong kind, empty clipboard, or code that
  fails the gate: one error toast names the reason and nothing is written.
  Pasted PNG bytes are proved by the registration's own check
  (`imgfiles.isReadablePng`) on the staged bytes before anything moves.
* **The overwrite is recoverable** (user decision, 2026-11-17). The bytes that
  were at the target move into the folder's `.removed versions` as
  `<name>.overwritten-<stamp>` (every scan skips that folder), the pasted bytes
  take the target's place, and ONE history entry undoes it whole: the paste
  parks back in a `.removed versions/.paste-<stamp>` staging and the old bytes
  return; redo swaps again. Both directions are pure file moves and the timeline
  holds only paths and pair files (never bytes), so undo and redo survive a
  restart. The create case's entry carries the pair file with and without the
  new record; its undo parks the created file and restores the pair file,
  exactly like a removed version.
* **Previews refresh in place**: `usesvgtext.bumpSvgFile` for a written `.svg`,
  and `selection/thumbs.bumpSideThumb` — a per-path generation the cached
  object-URL resolvers check — for a written PNG, so the row shows the pasted
  art without a rescan.
* **The corner is one cluster** (`.pair-thumb-corner`, bottom-right): the 🗑,
  where the preview has a version to remove, sits left of Paste; Paste is always
  the rightmost button. Selectors: [rows](../selectors/svg-generation-list-rows.md).

Tests: `tests/svg_paste_overwrite.test.tsx`.
