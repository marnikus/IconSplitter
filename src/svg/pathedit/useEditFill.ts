// useEditFill.ts — the Fill tool's presses in edit mode (2026-11-27). With the
// tool on, a click fills the closed area under it with the current colour
// (lib/pathedit/bucket); Alt+click picks the colour under the pointer into the
// current colour instead, and Alt+Shift+click also saves it as a swatch. The
// colour bar's "fill selected" recolours the selected shapes. Each is one undo
// step of the session.

import { useCallback } from "react";
import { fillAt, paintObjects } from "../../lib/pathedit/bucket";
import type { EditorState, PointerInput } from "../../lib/pathedit/gesture";
import type { PathModel } from "../../lib/pathedit/model";
import { cssToHex, saveSwatch, withFg } from "../../lib/pathedit/palette";
import { commit } from "../../lib/pathedit/session";
import { pathTagCount } from "../../lib/pathedit/svgdoc";
import { changePalette, getPalette } from "./editcolors";

/** The colour of the shape under the pointer: the session's own fill, else what the browser draws (fill, or the line's colour). */
export function colorUnder(e: Event, model: PathModel): string | null {
  const el = e.composedPath()[0] as Element | undefined;
  const raw = el?.getAttribute?.("data-edit-path");
  if (el === undefined || raw === null || raw === undefined) return null;
  const own = model.paint?.[Number(raw)];
  if (own !== undefined) return own;
  const look = getComputedStyle(el);
  return cssToHex(look.fill) ?? cssToHex(look.stroke);
}

function pick(e: PointerEvent, model: PathModel): void {
  const color = colorUnder(e, model);
  if (color === null) return;
  changePalette((p) => (e.shiftKey ? saveSwatch(withFg(p, color), color) : withFg(p, color)));
}

export interface EditFill {
  /** A press on the artboard; true = the Fill tool used it. */
  onPress: (input: PointerInput, e: PointerEvent) => boolean;
  /** Fills the selected shapes with the current colour. */
  fillSelected: () => void;
}

export function useEditFill(source: string, st: EditorState | null, setSt: (st: EditorState) => void): EditFill {
  const apply = useCallback((state: EditorState, next: PathModel | null) => {
    if (next !== null) setSt({ ...state, session: commit(state.session, next) });
  }, [setSt]);
  const onPress = useCallback((input: PointerInput, e: PointerEvent) => {
    if (st === null || st.session.tool !== "fill") return false;
    if (e.altKey) pick(e, st.session.model);
    else apply(st, fillAt(st.session.model, input.p, getPalette().fg, pathTagCount(source)));
    return true;
  }, [st, source, apply]);
  const fillSelected = useCallback(() => {
    if (st !== null && st.session.objects.length > 0) apply(st, paintObjects(st.session.model, st.session.objects, getPalette().fg));
  }, [st, apply]);
  return { onPress, fillSelected };
}
