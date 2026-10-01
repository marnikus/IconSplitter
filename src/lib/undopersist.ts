// undopersist.ts — pure (de)serialisation of the persisted undo timeline.
// Saves the stack AND the pre-history baseline (undoBase) plus the root the
// timeline belongs to, so a restart never applies history to the wrong folder.
// Corrupt or foreign payloads fall back to an empty timeline (RULE 13).

import { parseDecisions, serializeDecisions, type ReviewRecord } from "./reviewfile";
import { emptyStack, parseUndoStack, serializeUndoStack, type UndoStack } from "./undo";

export interface UndoSave {
  root: string;
  stack: UndoStack;
  base: ReviewRecord[];
}

export function emptyUndoSave(): UndoSave {
  return { root: "", stack: emptyStack(), base: [] };
}

export function parseUndoSave(text: string): UndoSave {
  try {
    const d = JSON.parse(text) as { root?: unknown; stack?: unknown; base?: unknown };
    const root = typeof d.root === "string" ? d.root : "";
    const stack = parseUndoStack(JSON.stringify(d.stack ?? null));
    const base = parseDecisions(JSON.stringify(d.base ?? null));
    return { root, stack, base: base.ok ? base.records : [] };
  } catch {
    return emptyUndoSave();
  }
}

export function serializeUndoSave(save: UndoSave): string {
  return JSON.stringify({
    v: 1,
    root: save.root,
    stack: JSON.parse(serializeUndoStack(save.stack)),
    base: JSON.parse(serializeDecisions(save.base)),
  });
}
