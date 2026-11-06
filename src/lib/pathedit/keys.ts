// keys.ts — the SVG edit mode's keyboard rules (2026-11-06), split from
// gesture.ts: Delete (keep the line joined) / Ctrl+Delete (break it), Esc,
// Enter (= Finish), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y on the session's history,
// and Ctrl+C / Ctrl+V with a clipboard that outlives a session. Pure apart from
// that clipboard.

import { copyPieces, pasteOffset, pastePieces } from "./clipboard";
import type { EditorState } from "./gesture";
import type { SubPath } from "./model";
import { breakAtAnchors, deleteAnchors } from "./ops";
import { commit, redoSession, undoSession, type EditSession } from "./session";

const withSession = (st: EditorState, session: EditSession): EditorState => ({ ...st, session });

export interface KeyInput { key: string; ctrl: boolean; shift: boolean }

const removeSelected = (s: EditSession): EditSession =>
  (s.selection.length === 0 ? s : { ...commit(s, deleteAnchors(s.model, s.selection)), selection: [], active: null });

/** Ctrl + Delete: the line breaks at the selected points. */
const breakSelected = (s: EditSession): EditSession =>
  (s.selection.length === 0 ? s : { ...commit(s, breakAtAnchors(s.model, s.selection)), selection: [], active: null });

/** Esc ends a draw in progress, else clears the selected anchors, else the selected paths. */
function escape(s: EditSession): EditSession {
  if (s.active !== null) return { ...s, active: null };
  return s.selection.length > 0 ? { ...s, selection: [] } : { ...s, objects: [] };
}

// Copy / paste (2026-11-06): the clipboard outlives a session, so a piece copied
// from one SVG pastes into the next one.
let clipboard: SubPath[] = [];

/** Tests start from an empty clipboard. */
export function clearEditClipboard(): void { clipboard = []; }

/** Ctrl+C: the selected runs become the clipboard (nothing selected keeps it). */
function copySelected(s: EditSession): EditSession {
  const pieces = copyPieces(s.model, s.selection);
  if (pieces.length > 0) clipboard = pieces;
  return s;
}

/** Ctrl+V: the clipboard pasted into the first selected object, nudged, selected — one undo step. */
function pasteClipboard(s: EditSession): EditSession {
  if (clipboard.length === 0) return s;
  const owner = s.objects[0] ?? clipboard[0].owner;
  const pasted = pastePieces(s.model, clipboard, owner, pasteOffset(clipboard));
  return { ...commit(s, pasted.model), selection: pasted.selection, active: null };
}

/** One entry per key (with Ctrl, without): adding a key never deepens a branch chain. */
const CTRL_KEYS: Record<string, (s: EditSession, shift: boolean) => EditSession> = {
  z: (s, shift) => (shift ? redoSession(s) : undoSession(s)),
  y: (s) => redoSession(s),
  c: (s) => copySelected(s),
  v: (s) => pasteClipboard(s),
  delete: (s) => breakSelected(s),
  backspace: (s) => breakSelected(s),
};
const PLAIN_KEYS: Record<string, (s: EditSession) => EditSession> = { delete: removeSelected, backspace: removeSelected, escape };

/** Keys: what they did, whether the editor used them, and whether Enter asked to finish. */
export function keyDown(st: EditorState, k: KeyInput): { state: EditorState; handled: boolean; finish: boolean } {
  const key = k.key.toLowerCase();
  if (!k.ctrl && key === "enter") return { state: st, handled: true, finish: true };
  const ctrl = k.ctrl ? CTRL_KEYS[key] : undefined;
  if (ctrl !== undefined) return { state: withSession(st, ctrl(st.session, k.shift)), handled: true, finish: false };
  const plain = k.ctrl ? undefined : PLAIN_KEYS[key];
  if (plain !== undefined) return { state: withSession(st, plain(st.session)), handled: true, finish: false };
  return { state: st, handled: false, finish: false };
}
