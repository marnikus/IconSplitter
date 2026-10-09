// FolderBar.tsx — the one folder control every tab shares (I-44) and the
// read-only row under it (I-46): a green "Open folder" button whose label never
// changes, then the picked folder's complete path as plain text. Why the row and
// not a field: the File System Access API hands a page only the picked folder's
// NAME, so the real path is captured at pick time from the user's own Explorer
// copy (ui/pickroot, I-35) — there is nothing here to type, clear or paste.
// The exact-handle registry keeps same-named picks separate across tabs too:
// a same-origin channel shares the captured handle, then verifies isSameEntry.

import { useEffect, useSyncExternalStore } from "react";
import { loadRootPathInfo, rootPathRevision, subscribeRootPaths, type PathHow } from "../lib/rootpath";
import type { DirHandleLike } from "../lib/fs";
import { knownRootPath, knownRootRevision, subscribeKnownRoots } from "./knownroots";
import { bindPasteCapture } from "./rootcapture";

export interface RootPath {
  path: string;
  how: PathHow | null;
}

/** The full path of `rootName`, re-read whenever any tab captures one. */
export function useRootPath(rootName: string, rootHandle?: DirHandleLike | null): RootPath {
  useSyncExternalStore(subscribeRootPaths, rootPathRevision, rootPathRevision);
  useSyncExternalStore(subscribeKnownRoots, knownRootRevision, knownRootRevision);
  const handlePath = rootHandle ? knownRootPath(rootHandle) : null;
  if (handlePath === null) return loadRootPathInfo(rootName);
  return handlePath === "" ? { path: "", how: null } : { path: handlePath, how: "copied" };
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
export function FolderPathRow({ rootName, rootHandle, testid }: {
  rootName: string; rootHandle?: DirHandleLike | null; testid: string;
}) {
  const info = useRootPath(rootName, rootHandle);
  useEffect(() => rootHandle ? bindPasteCapture(rootHandle) : () => undefined, [rootHandle]); // capture is scoped to this exact handle (I-52)
  if (rootName === "") return null;
  const path = info.path === "" ? rootName : info.path;
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
function note(info: RootPath): string {
  if (info.path !== "") return "";
  // both ways out are named, because the row cannot know which one the browser
  // will allow: Rescan re-reads the clipboard, Ctrl+V needs no permission (I-52)
  return "full path not captured — press Ctrl+Shift+C in Explorer, then Rescan (or Ctrl+V here)";
}
