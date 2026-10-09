// rootcapture.ts — the second and third chances to name the picked folder (I-52).
// The pick (ui/pickroot) is the primary capture, and the browser gives a page no
// other way to learn a folder's path: `showDirectoryPicker` reveals the name
// only, so the text has to come from the user's own clipboard. When the pick
// misses it — the clipboard held a copied folder rather than a path, the read
// was blocked, or the copy happened after the pick — these two channels recover
// it without another trip through the folder dialog:
//
//   * `retryCapture`    — what the existing `Rescan` does first: one more read,
//                         adopted only on an EXACT name match.
//   * `bindPasteCapture` — the user's own Ctrl+V anywhere outside a text field.
//                         A paste needs no permission and works inside iframes,
//                         so it is the way out when the browser blocks the
//                         clipboard API.
//
// Both obey one rule (RULE 13/4): an exact leaf match or nothing, recorded for
// the HANDLE on screen (I-63/D4) — so a capture repairs the folder it was made
// for, can replace a wrong one, and never reaches a folder that merely shares
// the name. And no read happens without the user's own gesture.

import { adoptCopiedText, readClipboardText } from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";
import { pathFor, type FolderRef, type RootPathInfo } from "../lib/pathmemory";

/**
 * The path a pasted (or re-read) text names for this folder: the exact folder it
 * names, else null — the same rule as the pick (I-59: nothing is completed).
 */
export async function captureFromPaste(text: string, handle: DirHandleLike | null): Promise<RootPathInfo | null> {
  if (handle === null || text === "") return null;
  const info = await adoptCopiedText(handle, text);
  return info.path === "" ? null : info;
}

/**
 * One more capture attempt for the folder on screen — the line `Rescan` says
 * when it lands, null when there is nothing to do or nothing to report. It reads
 * while the folder has no exact capture of its own: an unknown path, or one the
 * app could only DERIVE from a captured relative, which a real copy upgrades
 * (I-63/D4). Only a user gesture may read the clipboard (I-52), which is what
 * keeps a scan at boot from touching it.
 */
export async function retryCapture(handle: DirHandleLike | null): Promise<string | null> {
  if (handle === null || (await pathFor(handle)).how === "copied") return null;
  if (!byUserGesture()) return null;
  const read = await readClipboardText();
  if (read.state !== "text") return null;
  const info = await captureFromPaste(read.text, handle);
  return info === null ? null : `Folder path captured: ${info.path}`;
}

/**
 * True unless the platform says the user is not interacting — the platform's own
 * answer to "was this a gesture?", so a boot-time scan cannot read the clipboard
 * (browsers without the API, and the DOM in tests, count as a gesture).
 */
function byUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation;
  return activation?.isActive !== false;
}

/**
 * Adopts a pasted folder path for the folder on screen. Returns its unsubscribe.
 * A paste inside a text field is left alone — the app's own inputs keep their
 * text — and a paste that does not name this folder is silently ignored.
 */
export function bindPasteCapture(folder: FolderRef): () => void {
  const { name, handle } = folder;
  if (typeof document === "undefined" || handle === null || name === "") return () => undefined;
  const onPaste = (event: Event): void => {
    if (isField(event.target)) return;
    const data = (event as ClipboardEvent).clipboardData;
    void captureFromPaste(data?.getData("text/plain") ?? "", handle);
  };
  document.addEventListener("paste", onPaste);
  return () => document.removeEventListener("paste", onPaste);
}

/** A paste target that owns its own text: an input, a textarea or an editor. */
function isField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
