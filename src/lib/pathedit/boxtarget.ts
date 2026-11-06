// boxtarget.ts — what a point on the selection box means (2026-11-06): the
// rotate knob above it, a rotate zone just outside a corner, or one of the
// eight scale handles — and the cursor that says so on hover. One rule for the
// press (gesture.ts) and the cursor (useEditorInput).

import { HIT_PX } from "./hitpx";
import type { Pt } from "./model";
import { boxHandles, handleAt, rotateHandleOf, rotateZoneAt, selectionBox, type Box, type BoxHandleId } from "./scale";
import type { EditSession } from "./session";

/** The selection's box, when two or more anchors are selected in Select. */
export function scaleBoxOf(s: EditSession): Box | null {
  return s.tool === "select" && s.selection.length >= 2 ? selectionBox(s.model, s.selection) : null;
}

export type BoxTarget = { kind: "rotate"; box: Box } | { kind: "scale"; box: Box; handle: BoxHandleId };

/** The box part under `p` (`u` = path units per screen pixel), or null. */
export function boxTargetAt(s: EditSession, p: Pt, u: number): BoxTarget | null {
  const box = scaleBoxOf(s);
  if (box === null) return null;
  const pad = HIT_PX.scalePad * u, r = HIT_PX.scaleHandle * u;
  const knob = rotateHandleOf(box, pad, HIT_PX.rotateStem * u);
  if (Math.hypot(knob.x - p.x, knob.y - p.y) <= r) return { kind: "rotate", box };
  const handle = handleAt(boxHandles(box, pad), p, r);
  if (handle !== null) return { kind: "scale", box, handle };
  return rotateZoneAt(box, p, { pad, handle: r, reach: HIT_PX.rotateReach * u }) === null ? null : { kind: "rotate", box };
}

const RESIZE: Record<BoxHandleId, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};

/** The cursor a hover over `p` should show: "rotate", a CSS resize cursor, or null (the normal one). */
export function boxCursorAt(s: EditSession, p: Pt, u: number): string | null {
  const t = boxTargetAt(s, p, u);
  if (t === null) return null;
  return t.kind === "rotate" ? "rotate" : RESIZE[t.handle];
}
