// pickroot.ts — the ONE way every tab points the app at a folder (I-35), and
// the one boot restore they share. Why a picker of its own: Chrome's folder
// dialog hands a page a `FileSystemDirectoryHandle` and nothing else — no drive,
// no parent folders — so the pasteable Windows path has to be captured here, at
// the moment of the pick, from the text Explorer put on the clipboard, or proven
// from a folder the app already captured (I-51/I-63).
//
// Three rules keep the row honest:
//   * the clipboard is read only around a pick, and only what names THIS folder
//     is adopted (an exact leaf — nothing is completed from a parent, I-59);
//   * nothing is written before the answer is settled, and a pick the user has
//     already superseded writes nothing at all (I-63/D5);
//   * a folder the app cannot place answers no path, never a guess (I-35).

import { pickDirectory } from "../batch/picker";
import { adoptCopiedText, readClipboardText, type ClipState } from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";
import { pathFor, type PathHow, type RootPathInfo } from "../lib/pathmemory";
import { pathFromCopied } from "../lib/rootpath";

/** The picked folder, plus the full path captured for it ("" when none). */
export interface PickedRoot {
  handle: DirHandleLike;
  path: string;
  how: PathHow | null;
  /** What the clipboard did at pick time — it decides the line when nothing landed. */
  clip: ClipState;
}

/** Which pick is the newest. A superseded one reports, but never writes. */
let generation = 0;

/**
 * Picks a folder and captures its real path. Returns null when the user cancels
 * (or the API is missing) — and captures nothing then.
 */
export async function pickRootWithPath(): Promise<PickedRoot | null> {
  generation += 1;
  const token = generation;
  const before = await readClipboardText();
  const handle = await pickDirectory();
  if (!handle) return null;
  const read = before.text === "" ? await readClipboardText() : before;
  const info = await settle(handle, read.text, token);
  return { handle, path: info.path, how: info.how, clip: read.state };
}

/**
 * The path of the picked folder: the clipboard when it names it exactly, else
 * what a captured folder proves about it — below, above, or the same folder —
 * else nothing at all. Only an exact capture is recorded; a proven answer is
 * already known to the memory that proved it (I-63/D3).
 */
async function settle(handle: DirHandleLike, copied: string, token: number): Promise<RootPathInfo> {
  const named = pathFromCopied(copied, handle.name);
  if (named === "") return pathFor(handle);
  if (token !== generation) return { path: named, how: "copied" }; // superseded: never write
  return adoptCopiedText(handle, copied);
}

/**
 * The whole pick step every caller needs: pick, capture the path, hand the
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
 * The handle a tab restores at boot, with its path already proven for it — so
 * the folder row shows the right path on its first paint instead of blinking
 * *not captured* (RULE 24). Every tab restores through here, which is what keeps
 * the three boot paths from drifting apart (I-63/D6).
 */
export async function restoredRoot(handle: DirHandleLike | null): Promise<DirHandleLike | null> {
  if (handle === null) return null;
  await pathFor(handle);
  return handle;
}

/**
 * The one line every caller says about a capture — or null to stay quiet. The
 * path itself is on screen in the folder row (I-46), so the toast only has to
 * say that the capture happened.
 */
export function pickMessage(picked: PickedRoot): string | null {
  return picked.path !== "" ? `Folder path captured: ${picked.path}` : captureHelp(picked.clip);
}

/**
 * What to say when the path could not be captured — the row names the folder,
 * and this tells the user the one action that still fills it in (I-52). A
 * blocked read needs the paste (no permission needed); anything else is the
 * normal Explorer copy plus the Rescan that re-reads it.
 */
function captureHelp(clip: ClipState): string {
  if (clip === "blocked" || clip === "unsupported") {
    return "Folder path not captured — the browser blocked the clipboard: copy it in Explorer, then press Ctrl+V here";
  }
  return "Folder path not captured — in Explorer press Ctrl+Shift+C on the folder, then Rescan";
}
