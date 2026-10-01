// undostore.ts — localStorage persistence for the Selection undo timeline
// (mirrors the sister app's config/undo.json; here a browser app owns
// localStorage). JSON is validated on read; corrupt payloads -> empty
// timeline. A full quota never breaks the feature: the in-memory timeline
// keeps working and we simply skip the write.

import { emptyUndoSave, parseUndoSave, serializeUndoSave, type UndoSave } from "../lib/undopersist";
import type { ReviewRecord } from "../lib/reviewfile";
import type { UndoStack } from "../lib/undo";

const UNDO_KEY = "iconSplitter.undo.v1";

export function loadUndoSave(): UndoSave {
  const text = localStorage.getItem(UNDO_KEY);
  return text ? parseUndoSave(text) : emptyUndoSave();
}

export function saveUndoSave(stack: UndoStack, base: ReviewRecord[], root: string): void {
  try {
    localStorage.setItem(UNDO_KEY, serializeUndoSave({ root, stack, base }));
  } catch {
    // storage unavailable/full — timeline stays in memory for this session
  }
}
