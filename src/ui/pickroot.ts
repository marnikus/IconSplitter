// pickroot.ts — the one way to point the app at a folder to scan (I-35).
// Every tab's picker goes through here, so the picked folder's real path is
// captured the same way everywhere: read the clipboard BEFORE the dialog (the
// click's activation is freshest there), pick, and read it once more only if the
// first read was empty — the other natural order (copy after picking) still
// works. The captured text is matched against the folder that was really picked
// and never invented; when the clipboard is unreadable the folder is still
// returned, because the scan is what the user asked for. When the clipboard
// cannot name the folder exactly (nothing, or only a guess), the path is derived
// from a folder this app already picked (I-51) — a real handle relationship,
// never text.

import { pickDirectory } from "../batch/picker";
import { adoptCopiedText, readClipboardText, type ClipState } from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";
import { loadRootPathInfo, saveRootPathInfo, type PathHow, type RootPathInfo } from "../lib/rootpath";
import { deriveRootPath, rememberKnownRoot } from "./knownroots";

/** The picked folder, plus the full path captured for it ("" when none). */
export interface PickedRoot {
  handle: DirHandleLike;
  path: string;
  how: PathHow | null;
  /** What the clipboard did at pick time — it decides the line when nothing landed. */
  clip: ClipState;
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
  const before = await readClipboardText();
  const handle = await pickDirectory();
  if (!handle) return null;
  const read = before.text === "" ? await readClipboardText() : before;
  const info = await pathForPick(handle, read.text);
  rememberKnownRoot(handle, info.path);
  return { handle, path: info.path, how: info.how, clip: read.state };
}

/**
 * The path of the picked folder: the clipboard when it names it exactly, else
 * the derivation from a known ancestor (which is exact), else the clipboard's
 * flagged completion, else nothing at all (I-51).
 */
async function pathForPick(handle: DirHandleLike, copied: string): Promise<RootPathInfo> {
  const info = copied === "" ? UNKNOWN : adoptCopiedText(handle.name, copied);
  if (info.path !== "" && info.how !== "completed") return info;
  const derived = await deriveRootPath(handle);
  if (derived === null) return info;
  return saveRootPathInfo(handle.name, derived, "copied");
}

const UNKNOWN: RootPathInfo = { path: "", how: null };

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
 * The one line every caller says about a capture — or null to stay quiet. The
 * path itself is on screen in the folder row (I-46), so the toast only has to
 * say that the capture happened, and flag a completed one.
 */
export function pickMessage(picked: PickedRoot): string | null {
  if (picked.path !== "") {
    return picked.how === "completed"
      ? `Folder path completed from the copied folder: ${picked.path} — check it`
      : `Folder path captured: ${picked.path}`;
  }
  return captureHelp(picked.clip);
}

/**
 * What to say when the path could not be captured — the row names the folder,
 * and this tells the user the one action that still fills it in (I-52/RULE 12).
 * A blocked read needs the paste (no permission needed); anything else is the
 * normal Explorer copy plus the Rescan that re-reads it.
 */
function captureHelp(clip: ClipState): string {
  if (clip === "blocked" || clip === "unsupported") {
    return "Folder path not captured — the browser blocked the clipboard: copy it in Explorer, then press Ctrl+V here";
  }
  return "Folder path not captured — in Explorer press Ctrl+Shift+C on the folder, then Rescan";
}
