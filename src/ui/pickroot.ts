// pickroot.ts — the one way to point the app at a folder to scan (I-35).
// Every tab's picker goes through here, so the picked folder's real path is
// captured the same way everywhere: read the clipboard BEFORE the dialog (the
// click's activation is freshest there), pick, and read it once more only if the
// first read was empty — the other natural order (copy after picking) still
// works. The captured text is matched against the folder that was really picked
// and never invented; when the clipboard is unreadable the folder is still
// returned, because the scan is what the user asked for.

import { pickDirectory } from "../batch/picker";
import { adoptCopiedText, readCopiedText } from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";
import { loadRootPathInfo, type PathHow } from "../lib/rootpath";

/** The picked folder, plus the full path captured for it ("" when none). */
export interface PickedRoot {
  handle: DirHandleLike;
  path: string;
  how: PathHow | null;
}

/** The path captured at pick time for a handle, or the remembered one. */
export function capturedPath(handle: DirHandleLike): PickedRoot["path"] {
  return loadRootPathInfo(handle.name).path;
}

/**
 * Picks a folder and captures its real path from the clipboard. Returns null
 * when the user cancels (or the API is missing) — and stores nothing then.
 */
export async function pickRootWithPath(): Promise<PickedRoot | null> {
  const before = await readCopiedText();
  const handle = await pickDirectory();
  if (!handle) return null;
  const copied = before === "" ? await readCopiedText() : before;
  const info = copied === "" || copied === "none" ? { path: "", how: null } : adoptCopiedText(handle.name, copied);
  return { handle, path: info.path, how: info.how };
}

/**
 * The whole pick step every caller needs: pick, adopt the copied path, hand the
 * handle to `take` (which stores what its feature keeps), and return the handle
 * plus the one line to say about the capture — null when the user cancelled.
 * `take` runs before the caller scans, so the feature's own state is set first.
 */
export async function pickFolderFor(
  take: (handle: DirHandleLike) => void | Promise<void>,
): Promise<{ handle: DirHandleLike; message: string | null } | null> {
  const picked = await pickRootWithPath();
  if (!picked) return null;
  await take(picked.handle);
  return { handle: picked.handle, message: pickMessage(picked) };
}

/**
 * The one line said about a capture — or null to stay quiet. Voiced for the
 * gesture that captured it: the pick reads the clipboard, while a later paste
 * stands in for that read when the browser refused it (I-47).
 */
export function pickMessage(info: { path: string; how: PathHow | null }, via: "clipboard" | "paste" = "clipboard"): string | null {
  if (info.path === "") return null;
  const where = info.path;
  if (info.how === "completed") {
    const folder = via === "paste" ? "pasted" : "copied";
    return `Full path completed from the ${folder} folder: ${where} — check it`;
  }
  return `Full path taken from your ${via}: ${where}`;
}
