// pickroot.ts — the one way to point the app at a folder to scan (I-35).
// Every tab's picker goes through here, so the picked folder's real path is
// captured the same way everywhere: read the clipboard BEFORE the dialog (the
// click's activation is freshest there), pick, and read it once more when the
// first read named something else — a stale non-empty clipboard must never
// block the user's fresh copy (the third report, 2026-10-09). The captured
// text is matched against the folder that was really picked (exactly, or one
// level inside it) and never invented; the answer binds the picked HANDLE
// (I-63). When no text names it, the path is derived from a folder this app
// already placed exactly (I-51) — a real handle relationship in either
// direction, never text. Nothing else: a copied folder that is not this one is
// not completed into a guess (I-59).

import { pickDirectory } from "../batch/picker";
import { adoptCopiedText, readClipboardText, type ClipRead, type ClipState } from "../lib/clipboardpath";
import type { DirHandleLike } from "../lib/fs";
import { deriveRootPath, rememberKnownRoot } from "../lib/knownroots";
import { NO_ROOT_PATH, type RootPathInfo } from "../lib/rootpath";
import { persistRootPath } from "../lib/rootstore";

/** The picked folder, plus the full path captured for it ("" when none). */
interface PickedRoot {
  handle: DirHandleLike;
  path: string;
  how: RootPathInfo["how"];
  /** What the clipboard did at pick time — it decides the line when nothing landed. */
  clip: ClipState;
}

interface PickCapture extends RootPathInfo {
  clip: ClipState;
}

/**
 * Picks a folder and captures its real path from the clipboard. Returns null
 * when the user cancels (or the API is missing) — and stores nothing then.
 */
export async function pickRootWithPath(): Promise<PickedRoot | null> {
  const before = await readClipboardText();
  const handle = await pickDirectory();
  if (!handle) return null;
  const capture = await pathForPick(handle, before);
  return { handle, path: capture.path, how: capture.how, clip: capture.clip };
}

/**
 * The path of the picked folder: the before-dialog copy when it names the
 * folder, else the after-dialog copy, else the derivation from a known
 * relative folder (exact both ways, I-51), else nothing at all and an honest
 * empty binding — a name-same's remembered path must never stand in for this
 * folder (I-63).
 */
async function pathForPick(handle: DirHandleLike, before: ClipRead): Promise<PickCapture> {
  const fromBefore = await adoptCopiedText(handle, before.text);
  if (fromBefore.path !== "") return { ...fromBefore, clip: before.state };
  const after = await readClipboardText();
  const fromAfter = await adoptCopiedText(handle, after.text);
  if (fromAfter.path !== "") return { ...fromAfter, clip: after.state };
  return { ...(await derivedOrNothing(handle)), clip: after.state };
}

/** The handle-derived answer, saved and bound — or an honest empty binding. */
async function derivedOrNothing(handle: DirHandleLike): Promise<RootPathInfo> {
  const derived = await deriveRootPath(handle);
  if (derived === null) {
    rememberKnownRoot(handle, "");
    return NO_ROOT_PATH;
  }
  const info: RootPathInfo = { path: derived, how: "derived" };
  rememberKnownRoot(handle, info.path, "derived");
  await persistRootPath(handle, info);
  return info;
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
 * The one line every caller says about a capture — or null to stay quiet. The
 * path itself is on screen in the folder row (I-46), so the toast only has to
 * say that the capture happened.
 */
export function pickMessage(picked: PickedRoot): string | null {
  return picked.path !== "" ? `Folder path captured: ${picked.path}` : captureHelp(picked.clip);
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
