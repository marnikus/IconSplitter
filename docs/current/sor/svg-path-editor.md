# In-preview SVG path editor (2026-11-06)

[Generate SVG owner](svg-generation.md) · [regen marks](svg-regen-statuses.md) · [state history](topics/state-history.md)

**✎ Edit** beside a row's SVG version turns that preview into a short-lived
**edit session** on one icon (no new page; the frame grows to ≥ 440 px).
Anchors stay drawn for the whole session; **Finish edit** is the only moment
the SVG file is rewritten. **⚙ Edit settings** (bulk bar) sets the anchor size.

## Session

| Rule | Where |
|---|---|
| Edit is offered for a drawn SVG with a `<path>`, not while the row generates or waits | `svg/svgeditslot.tsx` `editBlocked` |
| Every drawn shape — `<path>`, `<circle>`, `<ellipse>`, `<rect>`, `<line>`, `<polyline>`, `<polygon>` (never inside defs/clipPath/mask/symbol/marker/pattern) — is an **object** of the session; a changed basic shape is written back as a `<path>` keeping its other attributes (`svgdoc.ts`). Objects are loaded into one model in the icon's root space through its own matrix (`lib/pathedit/objects.ts`). A one-path icon starts selected; otherwise click a path to edit | `SvgPathEditor.tsx`, `objects.ts` |
| Picking is by geometry (`hit.objectAt`), so a half-pixel stroke or an unfilled shape is still easy to pick: within the **click tolerance** (Edit settings, default 14 px) of any shape, else inside an unselected closed shape (topmost first). Click a path = only that path; another click switches; **Shift+click** adds / removes. Only selected paths show anchors and can be edited; anchors of several selected paths move together | `gesture.ts` `selectObject`, `session.editableSub` |
| The **marquee** selects anchors of every path inside it and selects those paths | `gesture.ts` `marqueeMove` |
| **Esc**: ends a draw in progress → clears selected anchors → clears selected paths | `gesture.ts` `escape` |
| Every anchor drawn all session; handles + arms only for the selection; Shift-snap target in red; marquee dashed; sizes in **screen px** (the path zooms, the chrome does not) | `pathedit/editoroverlay.ts` |
| Working copy only: the preview's path follows the model live; nothing written on drag | `SvgPathEditor.tsx` |
| Finish (button or Enter) — disabled while nothing changed — writes the file once; Cancel drops the session | `SvgPathEditor.tsx`, `svg/svgedit.ts` |
| In-session Ctrl+Z / Ctrl+Y step through edits (discarded by Cancel); the window's keys belong to the editor, row shortcuts never see them | `lib/pathedit/session.ts`, `pathedit/useEditorInput.ts` |

## Tools, pointer and keys

Two tools: **Select** (default) and **Draw**; switching keeps anchors and the selection.

- Select: click selects / empty click deselects; drag moves an anchor, a handle
  or a segment (its two anchors); empty drag = marquee; double-click a segment
  inserts.
- Draw: empty click adds a corner (mouse-down drag pulls a smooth pair), click
  a segment inserts, the first anchor of the open path closes it, an endpoint
  of another open path joins; Esc ends the open path.
- **Ctrl + click** an anchor: corner → smooth pair (⅓ of the shorter
  neighbouring segment, along the neighbours; endpoints along their segment);
  smooth/broken → corner. Never moves it.
- **Alt + drag** a smooth point's handle: becomes `broken`, only that handle
  moves; never creates handles; releasing Alt never re-smooths.
- Handle drag without Alt: smooth mirrors (same length), broken moves alone.
- **Shift + drag** an anchor snaps (8 px): a line end first, then the nearest
  point on a segment, against the drag-start path of **every** path (selected or
  not), never itself or its own two segments; other selected anchors move by
  the same delta.
- **Delete** removes selected anchors (neighbours join, their handles stay;
  an open end shortens; a two-point open path goes; a closed path stays closed
  with ≥ 3 points). Esc deselects; Enter = Finish.
- Hits: anchors / handles 9 px, segments a 6 px band; a selected point's
  handle wins over an anchor.

## Model and file

`lib/pathedit/model.ts`: anchors with position, in/out handle (or none) and
mode `corner` / `smooth` / `broken`, read through the shared outline reader
(arcs, quadratics, relative commands → absolute cubics). A segment is a line
only when neither side has a handle. Finish writes only `M`, `L`, `C`, `Z`
(a missing handle sits on its anchor), 2 decimals, and replaces **only that
changed path's `d`** in the file text (`objects.writeObjects` → `svgdoc.withPathD`,
each through the inverse of its matrix back into its own units) — untouched
paths and every other byte stay.

**Undo**: Finish records ONE `svgEdit` entry whose sides are the complete SVG
text before and after; undo / redo write it back (`applySvgEdit`) and every
preview of the file re-reads it (`usesvgtext.bumpSvgFile`). The session is
gone, so undo never reopens anchors. The panel lends its folder and history
push once (`useSvgEditBinding`) so rows never subscribe to the history.
Editing does not change the row's approval; SVG to upload sees the new file
and marks an export made before it as stale.

## Edit settings

`svg/EditSettingsButton.tsx`, `svg/editsettings.ts` (`iconSplitter.svg.editSettings.v1`):
anchor point size 4–24 px (default 10), used by the editor and the Ctrl-hover
dots (`anchoroverlay.ts`); **click tolerance to select a shape** 2–40 px
(default 14): how far from a (thin) shape's line a single click still picks it.

## Handles

`svg-edit-btn-<id>`, `svg-edit-<id>` (canvas), `-editor`, `-toolbar`,
`-tool-select`, `-tool-draw`, `-finish`, `-cancel`, `-pick`;
`svg-edit-settings`, `svg-edit-settings-dialog`, `svg-edit-anchor-px`, `svg-edit-pick-px`.

## Tests

`pathedit_core.test.ts` (model, ops, hit/snap, gestures, file), `pathedit_objects.test.ts`, `pathedit_shapes.test.ts` (shapes as objects, thin-line picking, shape → path write), `pathedit_pick_tolerance.test.tsx` (tolerance rule + setting)
(objects: select, Shift, Esc, marquee, joint moves, snap to unselected, per-object write), `pathedit_ui.test.tsx`
(session in the page, Finish + undo/redo, Edit settings, wiring).
