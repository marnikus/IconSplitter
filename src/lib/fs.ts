// fs.ts — File System Access adapter (thin; RULE 23 never-overwrite).
// Owns: reading a directory tree into scan.TreeNode, probing names, creating
// nested dirs, non-overwriting file writes, and file copy. Structural
// interfaces let tests run this logic against in-memory fakes (RULE 8).
// A read that fails is reported as an error state — never as a zero size
// (design D3): a File object also becomes unreadable the moment the file on
// disk changes, which is exactly what a concurrent write looks like.

import type { TreeNode } from "./scan";

export interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

export interface DirHandleLike {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  entries(): AsyncIterable<[string, DirHandleLike | FileHandleLike]>;
  /** Real FS handles remove files and (with `recursive`) whole subfolders. */
  removeEntry?(name: string, opts?: { recursive?: boolean }): Promise<void>;
}

/** Recursively snapshots a directory into a TreeNode (files get size/mtime). */
export async function readDirTree(root: DirHandleLike, ignore: string[]): Promise<TreeNode> {
  return { name: root.name, dir: true, children: await readChildren(root, ignore) };
}

async function readChildren(dir: DirHandleLike, ignore: string[]): Promise<TreeNode[]> {
  const out: TreeNode[] = [];
  for await (const [, handle] of dir.entries()) {
    const node = await toNode(handle, ignore);
    if (node) out.push(node);
  }
  return out;
}

async function toNode(handle: DirHandleLike | FileHandleLike, ignore: string[]): Promise<TreeNode | null> {
  if (handle.kind === "directory") {
    if (isIgnored(handle.name, ignore)) return null;
    return { name: handle.name, dir: true, children: await readChildren(handle, ignore) };
  }
  return fileNode(handle);
}

/** Two attempts: one immediate retry covers a temp-file swap mid-write. */
const READ_ATTEMPTS = 2;

async function fileNode(handle: FileHandleLike): Promise<TreeNode> {
  const f = await readFile(handle);
  if (f === null) return { name: handle.name, dir: false, size: 0, mtime: 0, error: "unreadable" };
  return { name: handle.name, dir: false, size: f.size, mtime: f.lastModified, error: null };
}

async function readFile(handle: FileHandleLike): Promise<File | null> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    try {
      return await handle.getFile();
    } catch {
      // the file is locked or being replaced; the next attempt decides
    }
  }
  return null;
}

function isIgnored(name: string, ignore: string[]): boolean {
  return ignore.some((x) => x.toLowerCase() === name.toLowerCase());
}

/** True when a child of the given kind exists (probe never creates). */
export async function nameExists(kind: "dir" | "file", parent: DirHandleLike, name: string): Promise<boolean> {
  try {
    if (kind === "dir") await parent.getDirectoryHandle(name, { create: false });
    else await parent.getFileHandle(name, { create: false });
    return true;
  } catch {
    return false;
  }
}

/** Creates (or reuses) every segment of a relative dir path. */
export async function ensureDirPath(root: DirHandleLike, relPath: string): Promise<DirHandleLike> {
  let cur = root;
  for (const seg of relPath.split("/").filter(Boolean)) {
    cur = await cur.getDirectoryHandle(seg, { create: true });
  }
  return cur;
}

/** Writes a new file; throws if the name already exists (RULE 23). */
export async function writeFileNew(dir: DirHandleLike, name: string, blob: Blob): Promise<void> {
  if (await nameExists("file", dir, name)) throw new Error(`File exists: ${name}`);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/** Copies a file's bytes into destDir under a new name (no overwrite). */
export async function copyFileTo(src: FileHandleLike, destDir: DirHandleLike, name: string): Promise<void> {
  const file = await src.getFile();
  await writeFileNew(destDir, name, file);
}

/**
 * Overwrites (or creates) a file. Reserved for app-owned metadata such as the
 * per-reference state JSON — user-visible outputs must use writeFileNew (RULE 23).
 */
export async function writeFileOverwrite(dir: DirHandleLike, name: string, blob: Blob): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/** Returns the child file handle, or null when absent. */
export async function tryGetFile(parent: DirHandleLike, name: string): Promise<FileHandleLike | null> {
  try {
    return await parent.getFileHandle(name, { create: false });
  } catch {
    return null;
  }
}

/** Navigates a relative dir path without creating; null if any segment absent. */
export async function probePath(root: DirHandleLike, relPath: string): Promise<DirHandleLike | null> {
  let cur = root;
  for (const seg of relPath.split("/").filter(Boolean)) {
    try {
      cur = await cur.getDirectoryHandle(seg, { create: false });
    } catch {
      return null;
    }
  }
  return cur;
}

/** Names of every child (dirs and files) of a directory. */
export async function listChildNames(dir: DirHandleLike): Promise<string[]> {
  const out: string[] = [];
  for await (const [name] of dir.entries()) out.push(name);
  return out;
}
