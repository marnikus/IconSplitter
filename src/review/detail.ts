// detail.ts — reads the two sides of the selected pair for the comparison
// window (spec §5). Owns: resolving a relative path to a File, loading it to
// read dimensions/format/size, and releasing the object URL again (RULE 20).

import { loadImageFile } from "../lib/dom";
import { resolveFileHandle, type DirHandleLike } from "../lib/fs";
import type { SideInfo, SideView } from "./sides";

export async function readSide(root: DirHandleLike, relPath: string): Promise<SideView> {
  try {
    const file = await (await resolveFileHandle(root, relPath)).getFile();
    const img = await loadImageFile(file);
    return { info: sideInfo(relPath, file, img), url: URL.createObjectURL(file), error: null };
  } catch (e) {
    return { info: null, url: null, error: messageOf(e) };
  }
}

export function releaseSide(side: SideView | null): void {
  if (side?.url) URL.revokeObjectURL(side.url);
}

function sideInfo(relPath: string, file: File, img: HTMLImageElement): SideInfo {
  return {
    relPath,
    width: img.naturalWidth,
    height: img.naturalHeight,
    size: file.size,
    format: formatOf(relPath),
  };
}

function formatOf(relPath: string): string {
  const dot = relPath.lastIndexOf(".");
  return dot < 0 ? "unknown" : relPath.slice(dot + 1).toUpperCase();
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
