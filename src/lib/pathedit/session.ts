// session.ts — one short-lived edit session on one path (2026-11-06): the
// untouched original, the working model, the session's own undo / redo (thrown
// away by Cancel), the selection, the tool and Draw's open subpath. Finish is
// allowed only when the working copy differs from the original. Pure.

import { cloneModel, toPathData, type AnchorRef, type PathModel } from "./model";

export type Tool = "select" | "draw";

export interface EditSession {
  original: PathModel;
  model: PathModel;
  undo: PathModel[];
  redo: PathModel[];
  selection: AnchorRef[];
  tool: Tool;
  /** Draw's open subpath that new clicks extend; null = the next click starts one. */
  active: number | null;
  /** The selected objects (icon paths): only their anchors are drawn and editable; all paths snap. */
  objects: number[];
}

export function newSession(model: PathModel, objects: number[] = []): EditSession {
  return { original: cloneModel(model), model: cloneModel(model), undo: [], redo: [], selection: [], tool: "select", active: null, objects };
}

/** Can subpath `sub` be hit and edited — does it belong to a selected object? Unowned subpaths always can. */
export function editableSub(s: EditSession, sub: number): boolean {
  const owner = s.model.subs[sub]?.owner;
  return owner === undefined || s.objects.includes(owner);
}

/** A finished step: `before` goes on the undo stack (the model when the gesture began). */
export function commit(s: EditSession, model: PathModel, before: PathModel = s.model): EditSession {
  if (toPathData(model, 4) === toPathData(before, 4)) return { ...s, model };
  return { ...s, model, undo: [...s.undo, before], redo: [] };
}

/** A step still in progress (a drag): shown, not yet on the undo stack. */
export function preview(s: EditSession, model: PathModel): EditSession {
  return { ...s, model };
}

export function undoSession(s: EditSession): EditSession {
  const prev = s.undo[s.undo.length - 1];
  if (prev === undefined) return s;
  return { ...s, model: prev, undo: s.undo.slice(0, -1), redo: [...s.redo, s.model], selection: [], active: null };
}

export function redoSession(s: EditSession): EditSession {
  const next = s.redo[s.redo.length - 1];
  if (next === undefined) return s;
  return { ...s, model: next, redo: s.redo.slice(0, -1), undo: [...s.undo, s.model], selection: [], active: null };
}

/** Switching tools keeps the anchors and the selection. */
export function setTool(s: EditSession, tool: Tool): EditSession {
  return { ...s, tool, active: tool === "select" ? null : s.active };
}

/** Finish is offered only when the written path would change. */
export function isDirty(s: EditSession): boolean {
  return toPathData(s.model) !== toPathData(s.original);
}
