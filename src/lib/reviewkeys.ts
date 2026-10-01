// reviewkeys.ts — keyboard map of the comparison view (spec §5, design legend).
// Owns: key → review action translation, including the guards that typing in a
// field never approves anything and that Space on a focused button stays a
// button press (spec §11).

export type HotkeyAction = "approve" | "decline" | "close" | "next" | "prev" | "zoom";

const LETTER_KEYS: Record<string, HotkeyAction> = { a: "approve", d: "decline" };
const NAMED_KEYS: Record<string, HotkeyAction> = {
  Escape: "close",
  ArrowRight: "next",
  ArrowDown: "next",
  ArrowLeft: "prev",
  ArrowUp: "prev",
  " ": "zoom",
};
const EDITABLE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

export function hotkeyAction(key: string, tagName: string): HotkeyAction | null {
  const tag = tagName.toUpperCase();
  if (EDITABLE_TAGS.includes(tag)) return null;
  if (key === " " && tag === "BUTTON") return null; // Space belongs to the focused button
  return LETTER_KEYS[key.toLowerCase()] ?? NAMED_KEYS[key] ?? null;
}
