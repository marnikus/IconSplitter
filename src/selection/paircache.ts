// paircache.ts — parsed pair files kept for the session (2026-11-06), so a
// rescan of an unchanged folder reads and parses no pair file at all. An entry
// is used only while the file's size AND modification time are exactly what the
// walk just saw; anything else is read again. Every pair-file write of the app
// (saveMetaAt) forgets that file in every folder's cache — even a write that
// lands with the same size in the same millisecond. A hit is a deep copy, so no
// caller can change the cached version.

import type { MetaRead } from "./pairstore";

/** What the walk saw of a file: an entry is valid only while both still match. */
export interface FileStamp { size: number; mtime: number }

interface Cached { stamp: FileStamp; read: MetaRead }

/** Per folder handle (each tab may hold its own handle to the same folder). */
const byRoot = new Map<object, Map<string, Cached>>();

export function cachedPairRead(root: object, relPath: string, stamp: FileStamp): MetaRead | null {
  const hit = byRoot.get(root)?.get(relPath);
  if (hit === undefined || hit.stamp.size !== stamp.size || hit.stamp.mtime !== stamp.mtime) return null;
  return structuredClone(hit.read);
}

export function rememberPairRead(root: object, relPath: string, stamp: FileStamp, read: MetaRead): void {
  if (read.missing) return;
  const files = byRoot.get(root) ?? new Map<string, Cached>();
  byRoot.set(root, files);
  files.set(relPath, { stamp: { size: stamp.size, mtime: stamp.mtime }, read: structuredClone(read) });
}

/** Two paths name the same file when one is the other seen from a parent folder. */
function sameFile(a: string, b: string): boolean {
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/** The app wrote this pair file: no folder may serve its old version. */
export function forgetPairFile(relPath: string): void {
  for (const files of byRoot.values()) {
    for (const cachedPath of [...files.keys()]) if (sameFile(cachedPath, relPath)) files.delete(cachedPath);
  }
}

export function clearPairCache(): void {
  byRoot.clear();
}
