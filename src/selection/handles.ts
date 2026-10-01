// handles.ts — tiny FS-handle resolution for Selection review (RULE 3).
// Maps a scan-relative path back to its file handle under the picked root,
// and renders honest OS-style path text for the clipboard fallback.

import { probePath, tryGetFile, type DirHandleLike, type FileHandleLike } from "../lib/fs";

/** File handle at a scan-relative path; null when any segment is absent. */
export async function resolveFile(root: DirHandleLike, relPath: string): Promise<FileHandleLike | null> {
  const segs = relPath.split("/");
  const name = segs[segs.length - 1];
  if (!name) return null;
  const dir = await probePath(root, segs.slice(0, -1).join("/"));
  return dir ? tryGetFile(dir, name) : null;
}

/** Explorer-style path text (backslashes) for the copy-path fallback. */
export function fullPathText(rootName: string, relPath: string): string {
  return `${rootName}\\${relPath.split("/").join("\\")}`;
}
