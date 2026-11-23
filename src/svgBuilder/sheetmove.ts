// sheetmove.ts — moves a sheet folder inside the scanned root (2026-11-22): into
// `_artboard_sheets/.removed versions` when its template or artboard is removed,
// and back on undo. The browser has no folder move, so every file is copied
// byte for byte, then the original folder is removed; the folders above it left
// empty go too — never `_artboard_sheets` itself. A source that is not there is
// nothing to move (already moved, or never made).
import { ensureDirPath, probePath, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import type { FolderMove } from "../lib/svgBuilder/removal";

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

async function copyTree(from: DirHandleLike, to: DirHandleLike): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (handle.kind === "directory") await copyTree(handle, await to.getDirectoryHandle(name, { create: true }));
    else await writeFileOverwrite(to, name, await handle.getFile());
  }
}

async function isEmpty(dir: DirHandleLike): Promise<boolean> {
  const it = dir.entries()[Symbol.asyncIterator]();
  const first = await it.next();
  await it.return?.();
  return first.done === true;
}

/** The folders above `path` that are empty now, removed upward; `_artboard_sheets` (no slash left) always stays. */
async function pruneEmptyParents(root: DirHandleLike, path: string): Promise<void> {
  for (let dir = parentOf(path); dir.includes("/"); dir = parentOf(dir)) {
    const handle = await probePath(root, dir);
    if (handle === null) continue;
    if (!(await isEmpty(handle))) return;
    await (await probePath(root, parentOf(dir)))?.removeEntry?.(nameOf(dir));
  }
}

async function dropQuietly(root: DirHandleLike, path: string): Promise<void> {
  try { await (await probePath(root, parentOf(path)))?.removeEntry?.(nameOf(path), { recursive: true }); } catch { /* left for the user to clear */ }
}

/** One move. False when its source is not there; a failed copy throws and removes a target it had just made. */
export async function moveSheetFolder(root: DirHandleLike, move: FolderMove): Promise<boolean> {
  const source = await probePath(root, move.from);
  const parent = await probePath(root, parentOf(move.from));
  if (source === null || parent === null) return false;
  if (parent.removeEntry === undefined) throw new Error("this browser cannot remove folders");
  const fresh = (await probePath(root, move.to)) === null;
  try {
    await copyTree(source, await ensureDirPath(root, move.to));
  } catch (error) {
    if (fresh) await dropQuietly(root, move.to);
    throw error;
  }
  await parent.removeEntry(nameOf(move.from), { recursive: true });
  await pruneEmptyParents(root, move.from);
  return true;
}

/** Every move in order; the first failure stops — what moved stays moved, and a retry skips it. */
export async function moveSheetFolders(root: DirHandleLike, moves: readonly FolderMove[]): Promise<void> {
  for (const m of moves) await moveSheetFolder(root, m);
}
