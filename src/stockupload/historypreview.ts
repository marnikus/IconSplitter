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

/** Returns an ephemeral object URL only when this is the same precisely-bound workspace. */
export async function loadHistoryPreviewUrl(
  root: DirHandleLike | null, batch: StockUploadBatch, file: StockUploadHistoryFile,
): Promise<string | null> {
  const mime = imageMime(file.fileName);
  if (!matchesWorkspace(root, batch) || file.relPath === null || mime === null) return null;
  try {
    const handle = await fileHandleAt(root, file.relPath);
    return handle === null ? null : URL.createObjectURL(new Blob([await handle.getFile()], { type: mime }));
  } catch {
    return null;
  }
}
