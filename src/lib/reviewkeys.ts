// reviewkeys.ts — keyboard map of the comparison window (spec §5).
// Owns: key → review action translation, including the guard that typing in a
// field never approves or declines anything (spec §11).

export type HotkeyAction = "approve" | "decline" | "close" | "next" | "prev";

const LETTER_KEYS: Record<string, HotkeyAction> = { a: "approve", d: "decline" };
const NAMED_KEYS: Record<string, HotkeyAction> = { Escape: "close", ArrowRight: "next", ArrowLeft: "prev" };
const EDITABLE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

export function hotkeyAction(key: string, tagName: string): HotkeyAction | null {
  if (EDITABLE_TAGS.includes(tagName.toUpperCase())) return null;
  return LETTER_KEYS[key.toLowerCase()] ?? NAMED_KEYS[key] ?? null;
}
