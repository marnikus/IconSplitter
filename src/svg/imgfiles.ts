// imgfiles.ts — the AI source images that live beside a pair (2026-11-02).
// Owns: listing the PNGs of the pair's folder AND of its
// "AI source regeneration versions" folder, and proving a file really is a PNG
// before the pair file records it. The pair file itself is read and written by
// selection/pairstore + lib/pairmeta, so this module never guesses at it.

import { listChildNames, probePath, readBytesAt, type DirHandleLike } from "../lib/fs";
import { imageRegenDir } from "../lib/svgimgreg";
import type { ScannedImage } from "../lib/imgimport";

const PNG_SUFFIX = ".png";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The folder a pair's files live in (the root itself when it has no subfolder). */
function dirOf(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  return dirPath === "" ? Promise.resolve(root) : probePath(root, dirPath);
}

function join(dirPath: string, name: string): string {
  return dirPath === "" ? name : `${dirPath}/${name}`;
}

/**
 * Every PNG this pair's folder holds: the ones next to the AI image (an earlier
 * build's, another tool's, the pre-split original) and the regenerations in the
 * app's own version folder. Nothing is read here — only names and paths.
 */
export async function listPairImages(root: DirHandleLike, dirPath: string): Promise<ScannedImage[]> {
  const here = await dirOf(root, dirPath);
  const own = here === null ? [] : namesOf(await listChildNames(here), dirPath);
  const regenDir = imageRegenDir(dirPath);
  const regen = await probePath(root, regenDir);
  const versions = regen === null ? [] : namesOf(await listChildNames(regen), regenDir);
  return [...own, ...versions];
}

function namesOf(names: readonly string[], dirPath: string): ScannedImage[] {
  return names.filter((n) => n.toLowerCase().endsWith(PNG_SUFFIX)).map((name) => ({ name, path: join(dirPath, name) }));
}

/** True only for a file whose bytes start like a PNG — never "it has a .png name". */
export async function isReadablePng(root: DirHandleLike, relPath: string): Promise<boolean> {
  const bytes = await readBytesAt(root, relPath);
  if (bytes === null || bytes.length <= PNG_MAGIC.length) return false;
  return PNG_MAGIC.every((byte, i) => bytes[i] === byte);
}
