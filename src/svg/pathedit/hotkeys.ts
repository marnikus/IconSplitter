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
  { keys: "Alt+Click line", icon: "✄", text: "Remove the line between two points · the rest stays" },
  { keys: "Alt+Shift+Click line", icon: "✂", text: "Remove the part of a line between two crossings, or a tail" },
  { keys: "Alt+Shift+Click fill", icon: "◍", text: "Cut a filled area out — it becomes a hole" },
  { keys: "Drag", icon: "✥", text: "Move anchor, handle, segment · a selected line moves the selection" },
  { keys: "Drag empty", icon: "⬚", text: "Box-select anchors (replaces)" },
  { keys: "Shift+Box", icon: "⊞", text: "Add the boxed points" },
  { keys: "Alt+Box", icon: "⊟", text: "Remove the boxed points" },
  { keys: "Double-click", icon: "⛶", text: "Select a whole line" },
  { keys: "Shift+Double-click", icon: "⊞", text: "Add a whole line to the selection" },
  { keys: "Alt+Double-click", icon: "⊟", text: "Exclude a whole line from the selection" },
  { keys: "Ctrl+A", icon: "▣", text: "Select all objects on the artboard" },
  { keys: "Ctrl+Click line", icon: "＋", text: "Insert an anchor" },
  { keys: "Ctrl+Click", icon: "◐", text: "Smooth ↔ corner point" },
  { keys: "Alt+Drag", icon: "⟀", text: "Break a handle pair" },
  { keys: "Shift+Drag", icon: "⌖", text: "Snap to ends and lines" },
  { keys: "Drag box handle", icon: "⤡", text: "Scale the selected points (2+)" },
  { keys: "Shift+Box handle", icon: "⊡", text: "Scale keeping proportions" },
  { keys: "Drag box edge", icon: "▱", text: "Skew the selected points by angle around the box centre (Shift: 15° steps)" },
  { keys: "Drag ○ / outside a corner", icon: "⟳", text: "Rotate the selected points (Shift: 15° steps)" },
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
  { keys: "K", icon: "🪣", text: "Fill tool: click a closed area to fill it with the current colour" },
  { keys: "Alt+Click (Fill)", icon: "⌖", text: "Pick the colour under the pointer · with Shift also save it as a swatch" },
  { keys: "X", icon: "⇄", text: "Swap the current and the second colour" },
  { keys: "I", icon: "◫", text: "Thin / preset stroke" },
  { keys: "Ctrl+Scroll", icon: "🔍", text: "Zoom 10–400% · 100% button resets" },
  { keys: "Middle-drag", icon: "✋", text: "Move the zoomed artboard" },
  { keys: "Arrows", icon: "✣", text: "Nudge selected points 1 unit (Shift 10)" },
  { keys: "←  →", icon: "⇆", text: "Previous / next SVG (nothing selected)" },
  { keys: "Ctrl+J", icon: "✂", text: "Highlight every tail to cut in this artwork" },
  { keys: "Ctrl+L", icon: "✓", text: "Apply the highlighted cut" },
  { keys: "Ctrl+]  Ctrl+[", icon: "⧉", text: "Selected shapes one layer forward / back" },
  { keys: "Ctrl+Shift+]  [", icon: "⇅", text: "Selected shapes to the front / to the back" },
  { keys: "Ctrl+Shift+E", icon: "◎", text: "Expand stroke: the selected lines become filled outlines" },
  { keys: "Ctrl+Shift+D", icon: "◩", text: "Divide: cut the selected overlapping fills into pieces" },
  { keys: "Ctrl+Shift+S", icon: "💾", text: "Save, approve & next SVG" },
  { keys: "Ctrl+Shift+X", icon: "✕", text: "Discard, decline & next SVG" },
];

export type ModalAction = "prev" | "next" | "save-next" | "decline-next" | "toggle-stroke" | "tool-select" | "tool-draw" | "cut-highlight" | "cut-apply"
  | "layer-forward" | "layer-backward" | "layer-front" | "layer-back" | "tool-fill" | "swap-colors" | "expand-stroke" | "divide";

const PLAIN: Record<string, ModalAction> = { arrowleft: "prev", arrowright: "next", i: "toggle-stroke", v: "tool-select", p: "tool-draw", k: "tool-fill", x: "swap-colors" };
const CTRL_SHIFT: Record<string, ModalAction> = { s: "save-next", x: "decline-next", e: "expand-stroke", d: "divide" };
/** The tail cutter: Ctrl+J highlights, Ctrl+L applies (Ctrl+Z, C, V … stay the session's own). */
const CTRL: Record<string, ModalAction> = { j: "cut-highlight", l: "cut-apply" };

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> & { code?: string };

/** The edit-mode action a key asks for, or null (the session's own keys are not here). */
export function modalKeyAction(e: KeyLike): ModalAction | null {
  return layerKey(e) ?? tableFor(e.ctrlKey || e.metaKey, e)[e.key.toLowerCase()] ?? null;
}

/**
 * Ctrl+] / Ctrl+[ (Shift: front / back, 2026-11-27). Read by the physical key
 * (`code`), so a keyboard layout whose bracket keys type other letters works.
 */
const LAYER_SIDE: Record<string, 1 | -1> = { BracketRight: 1, "]": 1, "}": 1, BracketLeft: -1, "[": -1, "{": -1 };
const LAYER_ACTION: Record<string, ModalAction> = { "1": "layer-forward", "-1": "layer-backward", "1s": "layer-front", "-1s": "layer-back" };

function layerKey(e: KeyLike): ModalAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const side = LAYER_SIDE[e.code ?? ""] ?? LAYER_SIDE[e.key];
  return side === undefined ? null : LAYER_ACTION[`${side}${e.shiftKey ? "s" : ""}`];
}

const NONE: Record<string, ModalAction> = {};

/** The key table the held modifiers select (Alt alone, or Ctrl+Alt, has none). */
function tableFor(ctrl: boolean, e: Pick<KeyboardEvent, "shiftKey" | "altKey">): Record<string, ModalAction> {
  if (ctrl && e.shiftKey) return CTRL_SHIFT;
  if (ctrl) return e.altKey ? NONE : CTRL;
  return e.altKey ? NONE : PLAIN;
}
