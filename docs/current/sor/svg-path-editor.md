# In-preview SVG path editor (2026-11-06)

[Generate SVG owner](svg-generation.md) · [regen marks](svg-regen-statuses.md) · [state history](topics/state-history.md) · [Alt+Shift cuts](svg-edit-cuts.md) · [fill](svg-edit-fill.md)

**✎ Edit** beside a row's SVG version — or **Enter** on the active row, or a
**double-click on the SVG thumbnail** (`editnav.editableRow`: a drawn SVG, no
run on the row; Enter on a focused button stays the button's) — opens the tab's
**full-screen edit mode** on that row (`pathedit/SvgEditModal.tsx`, one modal for the tab; the
open row lives in `editmodalstore.ts`). Every control is OUTSIDE the artboard:
the **AI SOURCE** panel left of the artboard (the row's main AI image —
`pathedit/AiSourcePanel.tsx`), the top bar (Select / Draw, **thin lines ↔ preset stroke**, **PREVIEW BG**
(`ui/PreviewBgPicker`, white by default, Edit settings `bg`), "row n / N · name", Finish edit, Cancel), **‹ ›** arrows on the artboard's sides, and the
**hotkey legend** at the bottom (`hotkeys.ts` `EDIT_HOTKEYS`). The artboard fits the window at the icon's ratio. Finish is the
only moment the SVG file is rewritten; **Cancel closes** the mode and drops the
session. **⚙ Edit settings** (bulk bar) sets anchor size and click tolerance.

## Edit mode keys and rows

- While the mode is on, **only edit keys work** — every other app shortcut is
  held back (`useEditorInput`: edit-mode keys first, then the session's); off,
  none of them exist. Text fields keep their keys.
- Session history is local: **Ctrl+Z** undo, **Ctrl+Shift+Z** (or Ctrl+Y)
  redo, at most **50** steps (`session.MAX_SESSION_HISTORY`); gone on Finish or
  Cancel.
- **← / →** (or side arrows) open the previous / next editable row (`editnav.neighborRow`,
  no wrap). With unsaved changes a dialog asks **Save and go** (Enter) / **Discard and go** /
  **Stay** (Esc). **Ctrl+Shift+S** saves, **approves** (`svgedit.approveEditedSvg`, own undo
  step) and goes next; **Ctrl+Shift+X** discards, **declines** (`svgedit.declineEditedSvg`,
  own undo step) and goes next (or closes on the last row). A failed save keeps the artboard.
- **Arrows** nudge the selected points 1 icon unit (Shift 10); a quick burst is one
  undo step. With nothing selected, ← / → change SVG (Esc deselects first).
- **I** switches thin hairlines / the tab's preset stroke sheet; **V** / **P**
  pick Select / Draw.

## Session

| Rule | Where |
|---|---|
| Edit is offered for a drawn SVG with a shape, not while the row generates or waits | `svg/svgeditslot.tsx` `editBlocked` |
| Every drawn shape — `<path>`, `<circle>`, `<ellipse>`, `<rect>`, `<line>`, `<polyline>`, `<polygon>` (never inside defs/clipPath/mask/symbol/marker/pattern) — is an **object** of the session; a changed basic shape is written back as a `<path>` keeping its other attributes (`svgdoc.ts`). Objects are loaded into one model in the icon's root space through its own matrix (`lib/pathedit/objects.ts`). A one-path icon starts selected; otherwise click a path to edit | `SvgPathEditor.tsx`, `objects.ts` |
| Picking by geometry (`hit.objectAt`): within the **click tolerance** (Edit settings, 14 px) of a shape, else on its painted fill — never an unfilled shape's empty inside. Paint and pen inherit from `<g>` and the root `<svg>`. A **stroke line** (no fill, or open with a pen) is its own object: a press within half its pen + tolerance selects and drags that one line; with one of its points picked, segments edit points (`strokepress.ts`) | `gesture.ts`, `session.editableSub` |
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
- **Scale**: 2+ selected anchors get a dashed box with 8 handles, 8 px out. A corner scales width and height freely, **Shift**
  keeps proportions; an edge scales one direction (Shift: both, pivot the
  opposite edge's middle). Pivot = the opposite side; curve handles scale with
  their anchors; one drag = one undo step (`lib/pathedit/scale.ts`). **Rotate**: the
  ○ above the box ([details](svg-path-editor-handles.md#rotate)).
- **Ctrl+C / Ctrl+V** copy and paste the selected anchors (each run of selected
  points along a line = one piece; a fully selected closed shape stays closed;
  pasted into the first selected object, nudged 5 %, selected, one undo step;
  the clipboard outlives the session — `clipboard.ts`, `keys.ts`).
  A press on a **line of the selection** drags the whole selection.
- Select: click selects / empty click deselects; drag moves an anchor, a handle
  or a segment (its two anchors); empty drag = marquee; **double-click a line**
  selects all its anchors; **Ctrl + click a line** inserts an anchor.
- Draw (`drawgesture.ts`): empty click adds (drag = smooth pair), segment
  inserts; an open end continues, the other end closes, another end joins.
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
- **Alt + Shift** cuts without touching anchors: over a line the part between
  two crossings (or a tail at an open end); over a filled area a click makes a
  hole ([rules and marks](svg-edit-cuts.md)).
- Hits: anchors / handles 9 px, segments a 6 px band; a selected point's
  handle wins over an anchor.

## Model and file

`lib/pathedit/model.ts`: anchors with position, in/out handle (or none) and
mode `corner` / `smooth` / `broken`, read through the shared outline reader
(arcs, quadratics, relative commands → absolute cubics). A segment is a line
only when neither side has a handle. Finish writes only `M`, `L`, `C`, `Z`
(a missing handle sits on its anchor), 2 decimals, and replaces **only that
changed path's `d`** in the file text (`objects.writeObjects` → `svgdoc.withPathDs`,
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

See [path editor — handles and tests](svg-path-editor-handles.md#edit-settings).

## Handles and tests

See [path editor — handles and tests](svg-path-editor-handles.md).
