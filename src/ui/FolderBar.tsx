// FolderBar.tsx — the one folder control every tab shares (I-44) and the
// read-only row under it (I-46): a green "Open folder" button whose label never
// changes, then the picked folder's complete path as plain text. Why the row and
// not a field: the File System Access API hands a page only the picked folder's
// NAME, so the real path is captured at pick time from the user's own Explorer
// copy (ui/pickroot, I-35) — there is nothing here to type, clear or paste.
//
// The path is the one `lib/pathmemory` can PROVE for this folder's handle
// (I-63): the row takes the folder, not a name, so it can never show the path of
// another folder that happens to be called the same — which is exactly what a
// name-keyed memory did. A capture made anywhere reaches every row at once
// (I-36/RULE 24), and the user's own Ctrl+V is captured here too (I-52).

import { useEffect, useSyncExternalStore } from "react";
import type { DirHandleLike } from "../lib/fs";
import {
  pathFor, pathRevision, peekPath, subscribePaths, type FolderRef, type RootPathInfo,
} from "../lib/pathmemory";
import { bindPasteCapture } from "./rootcapture";

/**
 * The proven path of `handle`, live: the mirror answers synchronously, the
 * effect re-proves whenever the handle changes or a capture lands anywhere.
 */
export function useRootPath(handle: DirHandleLike | null): RootPathInfo {
  const revision = useSyncExternalStore(subscribePaths, pathRevision, pathRevision);
  useEffect(() => { void pathFor(handle); }, [handle, revision]);
  return peekPath(handle);
}

/** The one button that opens the folder picker — the same words in every tab. */
export function OpenFolderButton({ onClick, testid }: { onClick: () => void; testid: string }) {
  return (
    <button
      type="button" className="folder-open" data-testid={testid} onClick={onClick}
      title="Pick the folder to scan — the path Explorer copied is captured with it"
    >
      Open folder
    </button>
  );
}

/**
 * The picked folder's complete path, on its own full-width line below the
 * controls: read-only text — never an input, never a button — plus the one
 * honest note when the browser withheld the path (I-46).
 */
export function FolderPathRow({ folder, testid }: { folder: FolderRef; testid: string }) {
  const { name, handle } = folder;
  const info = useRootPath(handle);
  useEffect(() => bindPasteCapture({ name, handle }), [name, handle]); // the user's own Ctrl+V (I-52)
  if (name === "") return null;
  const path = info.path === "" ? name : info.path;
  const warning = note(info);
  return (
    <div
      className={`folder-path${warning === "" ? "" : " warn"}`} data-testid={testid}
      title={warning === "" ? path : `${path} — ${warning}`}
    >
      <span className="folder-path-label">Full path</span>
      <code>{path}</code>
      <em>{warning}</em>
    </div>
  );
}

/**
 * The row's note: which state this path is in, and — when there is none — the
 * one action that still fills it in (I-46/I-52). The whole sentence is in the
 * row's `title`, so a long path never hides the way out.
 */
function note(info: RootPathInfo): string {
  if (info.path !== "") return "";
  // both ways out are named, because the row cannot know which one the browser
  // will allow: Rescan re-reads the clipboard, Ctrl+V needs no permission (I-52)
  return "full path not captured — press Ctrl+Shift+C in Explorer, then Rescan (or Ctrl+V here)";
}
