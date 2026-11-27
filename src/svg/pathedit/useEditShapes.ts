// useEditShapes.ts — the shape operations of edit mode on the selected shapes
// (2026-11-27): Expand stroke (lib/pathedit/outline) and Divide
// (lib/pathedit/divide). Each is one undo step of the session. Colours are
// taken as the browser really draws them (a stylesheet can overrule the
// file's attributes), falling back to the file's own.

import { useCallback, type RefObject } from "react";
import { divideObjects } from "../../lib/pathedit/divide";
import type { EditorState } from "../../lib/pathedit/gesture";
import { shapeLooks, type ShapeLook } from "../../lib/pathedit/looks";
import type { PathModel } from "../../lib/pathedit/model";
import { expandStrokes } from "../../lib/pathedit/outline";
import { cssToHex } from "../../lib/pathedit/palette";
import { commit } from "../../lib/pathedit/session";

/** The file's looks, with each drawn shape's colours as the browser shows them. */
export function drawnLooks(source: string, root: ShadowRoot | null): ShapeLook[] {
  return shapeLooks(source).map((look, o) => {
    const el = root?.querySelector(`[data-edit-path="${o}"]`) ?? null;
    if (el === null) return look;
    const css = getComputedStyle(el);
    return { ...look, fill: cssToHex(css.fill) ?? look.fill, stroke: look.stroke === null ? null : cssToHex(css.stroke) ?? look.stroke };
  });
}

export interface EditShapes {
  /** The selected shapes' lines become filled outlines. */
  expand: () => void;
  /** The selected overlapping fills are cut into separate pieces. */
  divide: () => void;
}

type Make = (m: PathModel, owners: readonly number[], looks: ShapeLook[]) => PathModel | null;

/** The session after an operation: one undo step, the new shapes selected with the old, no anchors picked. */
function applied(st: EditorState, next: PathModel): EditorState {
  const before = new Set((st.session.model.adds ?? []).map((a) => a.owner));
  const fresh = (next.adds ?? []).map((a) => a.owner).filter((o) => !before.has(o));
  const session = commit(st.session, next);
  return { ...st, session: { ...session, objects: [...session.objects, ...fresh], selection: [], active: null } };
}

export function useEditShapes(source: string, host: RefObject<HTMLElement | null>, st: EditorState | null, setSt: (st: EditorState) => void): EditShapes {
  const run = useCallback((make: Make) => {
    if (st === null || st.session.objects.length === 0) return;
    const next = make(st.session.model, st.session.objects, drawnLooks(source, host.current?.shadowRoot ?? null));
    if (next !== null) setSt(applied(st, next));
  }, [st, setSt, source, host]);
  const expand = useCallback(() => run(expandStrokes), [run]);
  const divide = useCallback(() => run((m, owners, looks) => divideObjects(m, owners, looks, looks.length)), [run]);
  return { expand, divide };
}
