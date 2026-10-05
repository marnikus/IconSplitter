// rootcapture.ts — the second and third chances to name the picked folder (I-52).
// The pick (ui/pickroot) is the primary capture, and the browser gives a page no
// other way to learn a folder's path: `showDirectoryPicker` reveals the name
// only, so the text has to come from the user's own clipboard. When the pick
// misses it — the clipboard held a copied folder rather than a path, the read
// was blocked, or the copy happened after the pick — these two channels recover
// it without another trip through the folder dialog:
//
//   * `retryCapture`   — what the existing `Rescan` does first: one more read,
//                        adopted only on an EXACT name match.
//   * `bindPasteCapture` — the user's own Ctrl+V anywhere outside a text field.
//                        A paste needs no permission and works inside iframes,
//                        so it is the way out when the browser blocks the
//                        clipboard API.
//
// Both obey one rule (RULE 13/4): an exact leaf match or nothing. A pasted
// parent folder, a word, a URL or markup is ignored and writes nothing, and no
// read happens without the user's own gesture — the clipboard is never polled.

import { readClipboardText } from "../lib/clipboardpath";
import { loadRootPathInfo, pathFromCopied, saveRootPathInfo, type RootPathInfo } from "../lib/rootpath";

/**
 * The path a pasted (or re-read) text names for `rootName`: the exact folder it
 * names, else null. The picker's "parent + name" completion is deliberately NOT
 * applied here — outside the pick, the app completes nothing.
 */
export function captureFromPaste(text: string, rootName: string): RootPathInfo | null {
  if (rootName === "" || text === "") return null;
  const info = pathFromCopied(text, rootName);
  if (info.path === "" || info.how !== "copied") return null;
  return saveRootPathInfo(rootName, info.path, "copied");
}

/**
 * One more capture attempt for a root whose path is still unknown — the line
 * `Rescan` says when it lands, null when there is nothing to do or nothing to
 * report. Only a real user gesture may read the clipboard (I-52), which is what
 * keeps a scan at boot from touching it.
 */
export async function retryCapture(rootName: string): Promise<string | null> {
  if (rootName === "" || loadRootPathInfo(rootName).path !== "") return null;
  if (!byUserGesture()) return null;
  const read = await readClipboardText();
  if (read.state !== "text") return null;
  const info = captureFromPaste(read.text, rootName);
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
 * Adopts a pasted folder path for the root on screen. Returns its unsubscribe.
 * A paste inside a text field is left alone — the app's own inputs keep their
 * text — and a paste that does not name this folder is silently ignored.
 */
export function bindPasteCapture(rootName: string): () => void {
  if (typeof document === "undefined" || rootName === "") return () => undefined;
  const onPaste = (event: Event): void => {
    if (isField(event.target)) return;
    const data = (event as ClipboardEvent).clipboardData;
    captureFromPaste(data?.getData("text/plain") ?? "", rootName);
  };
  document.addEventListener("paste", onPaste);
  return () => document.removeEventListener("paste", onPaste);
}

/** A paste target that owns its own text: an input, a textarea or an editor. */
function isField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
