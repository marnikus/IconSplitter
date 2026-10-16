// imgregfiles.ts — the disk side of AI source regeneration (2026-10-16):
// listing a pair's regenerated images and writing the next version into
// "AI source regeneration versions". User-visible outputs go through
// writeFileNew — an existing file is never overwritten (RULE 23).

import { ensureDirPath, probePath, writeFileNew, type DirHandleLike } from "../lib/fs";
import { IMAGE_REGEN_DIR, imageRegenDir } from "../lib/svgimgreg";

/** Names of the regeneration files already on disk for this pair. */
export async function listRegenNames(root: DirHandleLike, relDirPath: string): Promise<string[]> {
  const dir = await probePath(root, imageRegenDir(relDirPath));
  if (!dir) return [];
  const names: string[] = [];
  for await (const [name] of dir.entries()) names.push(name);
  return names;
}

/** Writes one regenerated image; resolves with its root-relative path. */
export async function writeRegenImage(root: DirHandleLike, relDirPath: string, name: string, blob: Blob): Promise<string> {
  const dir = await ensureDirPath(root, imageRegenDir(relDirPath));
  await writeFileNew(dir, name, blob);
  return relDirPath === "" ? `${IMAGE_REGEN_DIR}/${name}` : `${relDirPath}/${IMAGE_REGEN_DIR}/${name}`;
}
