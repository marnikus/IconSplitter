# In-preview SVG path editor (2026-11-06)

[Generate SVG owner](svg-generation.md) · [regen marks](svg-regen-statuses.md) · [state history](topics/state-history.md)

**✎ Edit** beside a row's SVG version opens the tab's **full-screen edit
mode** on that row (`pathedit/SvgEditModal.tsx`, one modal for the tab; the
open row lives in `editmodalstore.ts`). Every control is OUTSIDE the artboard:
the top bar (Select / Draw, **thin lines ↔ preset stroke** switch, **PREVIEW BG**
(the shared `ui/PreviewBgPicker`: presets or a custom colour, white by default,
remembered in Edit settings `bg`), "row n / N · name", Finish edit, Cancel), **‹ ›** arrows on the artboard's sides, and the
**hotkey legend** at the bottom (`hotkeys.ts` `EDIT_HOTKEYS`: icon + keys +
short text). The artboard fits the window at the icon's ratio. Finish is the
only moment the SVG file is rewritten; **Cancel closes** the mode and drops the
session. **⚙ Edit settings** (bulk bar) sets anchor size and click tolerance.

## Edit mode keys and rows

- While the mode is on, **only edit keys work** — every other app shortcut is
  held back (`useEditorInput`: edit-mode keys first, then the session's); off,
  none of them exist. Text fields keep their keys.
- Session history is local: **Ctrl+Z** undo, **Ctrl+Shift+Z** (or Ctrl+Y)
  redo, at most **50** steps (`session.MAX_SESSION_HISTORY`); gone on Finish or
  Cancel.
- **← / →** (or the side arrows) open the previous / next editable row in the
  list's order (`editnav.neighborRow`, no wrap) at once, ready to edit. With
  unsaved changes a question asks **Save and go** (Enter) / **Discard and go** /
  **Stay** (Esc). **Ctrl+Shift+S** saves, **approves** (Generate SVG review, its own
  undo step, even when nothing changed — `svgedit.approveEditedSvg`) and goes next; **Ctrl+Shift+X**
  discards and goes next. A failed save keeps the artboard.
- **I** switches thin hairlines / the tab's preset stroke sheet; **V** / **P**
  pick Select / Draw.

## Session

| Rule | Where |
|---|---|
| Edit is offered for a drawn SVG with a shape, not while the row generates or waits | `svg/svgeditslot.tsx` `editBlocked` |
| Every drawn shape — `<path>`, `<circle>`, `<ellipse>`, `<rect>`, `<line>`, `<polyline>`, `<polygon>` (never inside defs/clipPath/mask/symbol/marker/pattern) — is an **object** of the session; a changed basic shape is written back as a `<path>` keeping its other attributes (`svgdoc.ts`). Objects are loaded into one model in the icon's root space through its own matrix (`lib/pathedit/objects.ts`). A one-path icon starts selected; otherwise click a path to edit | `SvgPathEditor.tsx`, `objects.ts` |
| Picking is by geometry (`hit.objectAt`), so a half-pixel stroke or an unfilled shape is still easy to pick: within the **click tolerance** (Edit settings, default 14 px) of any shape, else inside an unselected closed shape (topmost first). Click a path = only that path; another click switches; **Shift+click** adds / removes. Only selected paths show anchors and can be edited; anchors of several selected paths move together | `gesture.ts` `selectObject`, `session.editableSub` |
| The **marquee** selects anchors of every path inside it and selects those paths | `gesture.ts` `marqueeMove` |
| **Esc**: ends a draw in progress → clears selected anchors → clears selected paths | `gesture.ts` `escape` |
| Every anchor drawn all session; handles + arms only for the selection; Shift-snap target in red; marquee dashed; sizes in **screen px** (the path zooms, the chrome does not) | `pathedit/editoroverlay.ts` |
| Working copy only: changed shapes follow the model live (a changed `<circle>`/`<rect>`/… is swapped for the `<path>` Finish writes, since it ignores `d`); nothing written on drag. The thin guide line is drawn only in the thin view — preset shows the thick stroke and anchors | `useEditMode.ts` `liveShape`, `editoroverlay.ts` |
| Finish (button or Enter) — disabled while nothing changed — writes the file once and closes; Cancel closes and drops the session | `useEditMode.ts`, `SvgEditModal.tsx`, `svg/svgedit.ts` |


## Tools, pointer and keys

Two tools: **Select** (default) and **Draw**; switching keeps anchors and the selection.

- Selection modifiers: **Shift + click** adds a point (a Shift-drag then moves
  the whole selection, snapping), **Shift + box** adds the boxed points;
  **Alt + click** removes a point (no move), **Alt + box** removes the boxed
  points; a Shift / Alt click on empty space keeps the selection
  (`gesture.ts` `SelectMode`).
- **Scale**: with 2+ anchors selected a dashed box with 8 handles appears (8 px
  outside the anchors). A corner scales width and height freely, **Shift**
  keeps proportions; an edge scales one direction (Shift: both, pivot the
  opposite edge's middle). Pivot = the opposite side; curve handles scale with
  their anchors; one drag = one undo step (`lib/pathedit/scale.ts`).
- Select: click selects / empty click deselects; drag moves an anchor, a handle
  or a segment (its two anchors); empty drag = marquee; **double-click a line**
  selects all its anchors; **Ctrl + click a line** inserts an anchor.
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
- **Delete** removes selected anchors and keeps the line joined (neighbours join, their handles stay;
  an open end shortens; a two-point open path goes; a closed path stays closed
  with ≥ 3 points). **Ctrl + Delete** breaks the line at the selected points
  (`ops.breakAtAnchors`: the point and its two segments go; a closed shape opens
  there; the new ends lose the handles that pointed at removed segments). Esc
  deselects; Enter = Finish.
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

## Handles and tests

See [path editor — handles and tests](svg-path-editor-handles.md).
