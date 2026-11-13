// historypreview.ts — resolve image previews from the matching currently open root.

import { boundRootPathInfo } from "../lib/knownroots";
import { probePath, tryGetFile, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { normalizeRootPath } from "../lib/rootpath";
import type { StockUploadBatch, StockUploadHistoryFile } from "../lib/stockupload/batchhistory";

function imageMime(fileName: string): string | null {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return ext === "svg" ? "image/svg+xml" : null;
}

function matchesWorkspace(root: DirHandleLike | null, batch: StockUploadBatch): root is DirHandleLike {
  return root !== null && batch.rootPath !== ""
    && normalizeRootPath(boundRootPathInfo(root).path) === batch.rootPath;
}

async function fileHandleAt(root: DirHandleLike, relPath: string): Promise<FileHandleLike | null> {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? root : await probePath(root, relPath.slice(0, at));
  return dir === null ? null : tryGetFile(dir, relPath.slice(at + 1));
}

function isEps(fileName: string): boolean {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() === "eps";
}

function sameBaseImage(name: string, epsName: string): boolean {
  const dot = epsName.lastIndexOf(".");
  const base = epsName.slice(0, dot).toLocaleLowerCase();
  const imageDot = name.lastIndexOf(".");
  return imageDot > 0 && name.slice(0, imageDot).toLocaleLowerCase() === base && imageMime(name) !== null;
}

/** EPS files are not browser previews; use a same-basename raster beside them. */
async function siblingImageAt(root: DirHandleLike, relPath: string, epsName: string): Promise<{ handle: FileHandleLike; mime: string } | null> {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? root : await probePath(root, relPath.slice(0, at));
  if (dir === null) return null;
  const candidates = new Map<string, FileHandleLike>();
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file" && sameBaseImage(name, epsName)) candidates.set(name.toLowerCase(), handle);
  }
  // Prefer JPEG (including .jpeg), then PNG, without depending on directory order.
  const stem = epsName.slice(0, epsName.lastIndexOf("."));
  for (const ext of ["jpg", "jpeg", "png"]) {
    const name = `${stem}.${ext}`.toLowerCase();
    const handle = candidates.get(name);
    if (handle) return { handle, mime: imageMime(handle.name)! };
  }
  return null;
}

/** Returns an ephemeral object URL only when this is the same precisely-bound workspace. */
export async function loadHistoryPreviewUrl(
  root: DirHandleLike | null, batch: StockUploadBatch, file: StockUploadHistoryFile,
): Promise<string | null> {
  if (!matchesWorkspace(root, batch) || file.relPath === null) return null;
  try {
    const directMime = imageMime(file.fileName);
    if (directMime !== null) {
      const handle = await fileHandleAt(root, file.relPath);
      return handle === null ? null : URL.createObjectURL(new Blob([await handle.getFile()], { type: directMime }));
    }
    if (!isEps(file.fileName)) return null;
    const sibling = await siblingImageAt(root, file.relPath, file.fileName);
    return sibling === null ? null : URL.createObjectURL(new Blob([await sibling.handle.getFile()], { type: sibling.mime }));
  } catch {
    return null;
  }
}
