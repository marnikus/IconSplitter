// hotkeys.ts — the edit mode's keys (2026-11-06): the legend shown under the
// artboard (one entry per gesture, a small icon and a short description) and
// the edit-mode actions the session's own rules do not cover (moving between
// rows, save / discard & next, the stroke view, the tools). While edit mode is
// on, these and the session's keys are the only keys; off, none of them exist.

export interface HotkeyHelp { keys: string; icon: string; text: string }

export const EDIT_HOTKEYS: readonly HotkeyHelp[] = [
  { keys: "Click", icon: "⬉", text: "Select an anchor or a shape" },
  { keys: "Shift+Click", icon: "⊕", text: "Add a point · add / remove a shape" },
  { keys: "Alt+Click", icon: "⊖", text: "Remove a point from the selection" },
  { keys: "Drag", icon: "✥", text: "Move anchor, handle, segment · a selected line moves the selection" },
  { keys: "Drag empty", icon: "⬚", text: "Box-select anchors (replaces)" },
  { keys: "Shift+Box", icon: "⊞", text: "Add the boxed points" },
  { keys: "Alt+Box", icon: "⊟", text: "Remove the boxed points" },
  { keys: "Double-click", icon: "⛶", text: "Select a whole line" },
  { keys: "Ctrl+Click line", icon: "＋", text: "Insert an anchor" },
  { keys: "Ctrl+Click", icon: "◐", text: "Smooth ↔ corner point" },
  { keys: "Alt+Drag", icon: "⟀", text: "Break a handle pair" },
  { keys: "Shift+Drag", icon: "⌖", text: "Snap to ends and lines" },
  { keys: "Drag box handle", icon: "⤡", text: "Scale the selected points (2+)" },
  { keys: "Shift+Box handle", icon: "⊡", text: "Scale keeping proportions" },
  { keys: "Delete", icon: "⌫", text: "Delete points, keep the line joined" },
  { keys: "Ctrl+Delete", icon: "✂", text: "Break the line at the points" },
  { keys: "Esc", icon: "⎋", text: "End path · deselect" },
  { keys: "Enter", icon: "✓", text: "Finish edit" },
  { keys: "Ctrl+C", icon: "⧉", text: "Copy the selected points / lines" },
  { keys: "Ctrl+V", icon: "📋", text: "Paste (also into the next SVG)" },
  { keys: "Ctrl+Z", icon: "↶", text: "Undo (this session)" },
  { keys: "Ctrl+Shift+Z", icon: "↷", text: "Redo (also Ctrl+Y)" },
  { keys: "V", icon: "⬉", text: "Select tool" },
  { keys: "P", icon: "✒", text: "Draw tool" },
  { keys: "I", icon: "◫", text: "Thin / preset stroke" },
  { keys: "Ctrl+Shift+Scroll", icon: "🔍", text: "Zoom 10–400% · 100% button resets" },
  { keys: "Middle-drag", icon: "✋", text: "Move the zoomed artboard" },
  { keys: "←  →", icon: "⇆", text: "Previous / next SVG" },
  { keys: "Ctrl+Shift+S", icon: "💾", text: "Save, approve & next SVG" },
  { keys: "Ctrl+Shift+X", icon: "🗑", text: "Discard & next SVG" },
];

export type ModalAction = "prev" | "next" | "save-next" | "discard-next" | "toggle-stroke" | "tool-select" | "tool-draw";

const PLAIN: Record<string, ModalAction> = { arrowleft: "prev", arrowright: "next", i: "toggle-stroke", v: "tool-select", p: "tool-draw" };
const CTRL_SHIFT: Record<string, ModalAction> = { s: "save-next", x: "discard-next" };

/** The edit-mode action a key asks for, or null (the session's own keys are not here). */
export function modalKeyAction(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): ModalAction | null {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.shiftKey) return CTRL_SHIFT[key] ?? null;
  if (ctrl || e.altKey) return null;
  return PLAIN[key] ?? null;
}
