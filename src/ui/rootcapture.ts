// rootcapture.ts — Rescan and Ctrl+V are the late-capture channels (I-52).
// The picker (ui/pickroot) is the primary capture. These paths use the exact
// active directory handle, so a paste for one folder can never name every
// same-leaf folder in another tree.

import {
  clearRejectedClipboardPath, isLastAppCopiedPath, isRejectedClipboardPath, readClipboardText,
} from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";
import { loadRootPathInfo, pathFromCopied, saveRootPathInfo, type RootPathInfo } from "../lib/rootpath";
import { deriveRootPath, knownRootPath, publishKnownRootPath, updateKnownRootPath } from "./knownroots";

/**
 * Captures an exact path for this handle, else null. Verified handle relationships
 * outrank clipboard text; app-owned location copies and ambiguous evidence are
 * never accepted as a new path.
 */
export async function captureFromPaste(
  text: string, root: DirHandleLike | null, source: "paste" | "rescan" = "paste",
): Promise<RootPathInfo | null> {
  if (root === null || root.name === "" || text === "") return null;
  const derived = await deriveRootPath(root);
  const path = capturePath(text, root, source, derived);
  if (path === "") return null;
  const saved = saveRootPathInfo(root.name, path);
  await updateKnownRootPath(root, saved.path); // a later pick inside this exact folder can derive (I-51)
  publishKnownRootPath(root, saved.path);
  return saved;
}

function capturePath(
  text: string, root: DirHandleLike, source: "paste" | "rescan", derived: Awaited<ReturnType<typeof deriveRootPath>>,
): string {
  const appCopy = isLastAppCopiedPath(text);
  const rejected = isRejectedClipboardPath(root.name, text);
  if (derived.kind === "ambiguous") return "";
  if (derived.kind === "derived") return derived.path;
  if (appCopy || (source === "rescan" && rejected)) return "";
  if (source === "paste") clearRejectedClipboardPath(root.name);
  return pathFromCopied(text, root.name).path;
}

/**
 * One more capture attempt for a root whose path is still unknown. Only a real
 * user gesture may read the clipboard (I-52); a boot-time scan never polls it.
 */
export async function retryCapture(root: DirHandleLike | null): Promise<string | null> {
  if (root === null || root.name === "") return null;
  const path = knownRootPath(root) ?? loadRootPathInfo(root.name).path;
  if (path !== "") return null;
  if (!byUserGesture()) return null;
  const read = await readClipboardText();
  if (read.state !== "text") return null;
  const info = await captureFromPaste(read.text, root, "rescan");
  return info === null ? null : `Folder path captured: ${info.path}`;
}

/** The platform's own answer to "was this a gesture?" */
function byUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation;
  return activation?.isActive !== false;
}

/**
 * Adopts a pasted folder path for the active root. Text fields keep their own
 * paste behavior; a wrong-folder or app-owned copy is silently ignored.
 */
export function bindPasteCapture(root: DirHandleLike | null): () => void {
  if (typeof document === "undefined" || root === null || root.name === "") return () => undefined;
  const onPaste = (event: Event): void => {
    if (isField(event.target)) return;
    const data = (event as ClipboardEvent).clipboardData;
    void captureFromPaste(data?.getData("text/plain") ?? "", root);
  };
  document.addEventListener("paste", onPaste);
  return () => document.removeEventListener("paste", onPaste);
}

/** A paste target that owns its own text: an input, a textarea or an editor. */
function isField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
