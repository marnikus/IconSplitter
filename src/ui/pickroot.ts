// pickroot.ts — the one way to point the app at a folder to scan (I-35).
// Every tab's picker goes through here, so the picked folder's real path is
// captured the same way everywhere: read the clipboard BEFORE the dialog (the
// click's activation is freshest there), pick, and read it once more only if
// the first read was empty — the other natural order (copy after picking) still
// works. The captured text is matched against the folder that was really picked
// and never completed or invented; when the clipboard is unreadable the folder
// is still returned, because the scan is what the user asked for. Nothing is
// announced: the tab's own path row states what was captured
// (design 2026-10-05-folder-ui).

import { pickDirectory } from "../batch/picker";
import { adoptCopiedText, readCopiedText } from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";

/**
 * Picks a folder and captures its real path from the clipboard. Returns null
 * when the user cancels (or the API is missing) — and stores nothing then.
 */
export async function pickRootWithPath(): Promise<DirHandleLike | null> {
  const before = await readCopiedText();
  const handle = await pickDirectory();
  if (!handle) return null;
  const copied = before === "" ? await readCopiedText() : before;
  if (copied !== "" && copied !== "none") adoptCopiedText(handle.name, copied);
  return handle;
}

/**
 * The whole pick step every caller needs: pick, capture the path, hand the
 * handle to `take` (which stores what its feature keeps). Null when cancelled;
 * `take` then never runs, so nothing is stored for a cancelled pick.
 */
export async function pickFolderFor(
  take: (handle: DirHandleLike) => void | Promise<void>,
): Promise<DirHandleLike | null> {
  const handle = await pickRootWithPath();
  if (!handle) return null;
  await take(handle);
  return handle;
}
