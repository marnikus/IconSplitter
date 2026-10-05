// FolderBar.tsx — the one folder control every tab shares (I-44) and the
// read-only row under it (I-46): a green "Open folder" button whose label never
// changes, then the picked folder's complete path as plain text. Why the row and
// not a field: the File System Access API hands a page only the picked folder's
// NAME, so the real path is captured at pick time from the user's own Explorer
// copy (ui/pickroot, I-35) — there is nothing here to type, clear or paste.
// Storage (lib/rootpath) is the single source of truth: a capture made by any
// picker appears in every row at once, with no reload (I-36/RULE 24).

import { useSyncExternalStore } from "react";
import { loadRootPathInfo, rootPathRevision, subscribeRootPaths, type PathHow } from "../lib/rootpath";

export interface RootPath {
  path: string;
  how: PathHow | null;
}

/** The full path of `rootName`, re-read whenever any tab captures one. */
export function useRootPath(rootName: string): RootPath {
  useSyncExternalStore(subscribeRootPaths, rootPathRevision, rootPathRevision);
  return loadRootPathInfo(rootName);
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
export function FolderPathRow({ rootName, testid }: { rootName: string; testid: string }) {
  const info = useRootPath(rootName);
  if (rootName === "") return null;
  const path = info.path === "" ? rootName : info.path;
  return (
    <div className={`folder-path${info.how === "completed" ? " warn" : ""}`} data-testid={testid} title={path}>
      <span className="folder-path-label">Full path</span>
      <code>{path}</code>
      <em>{note(info)}</em>
    </div>
  );
}

/** The row's one warning state: a path the app completed from a copied parent. */
function note(info: RootPath): string {
  if (info.how === "completed") return "completed — check it";
  return info.path === "" ? "full path not captured" : "";
}
