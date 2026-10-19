// imgfiles.ts — discover existing AI version files on disk, and build the
// default AiVersion/v1 record for an original source. Mirrors svg/svgfiles.ts
// and svg/sources.ts metaForSource. Pure+IO: reads directory entries, no writes.

import { AI_VERSIONS_DIR, extForFormat, isImageFormat, versionOfImgFileName } from "../lib/imgfile";
import { probePath, type DirHandleLike } from "../lib/fs";
import { newPairMeta, type PairMeta, type PairSide } from "../lib/pairmeta";
import type { SvgSource } from "../svg/sources";

/** AI version files on disk for one source (file names inside the versions dir). */
export async function listImgFiles(root: DirHandleLike, source: SvgSource): Promise<string[]> {
  const dir = await probePath(root, relDir(source, AI_VERSIONS_DIR));
  if (dir === null) return [];
  const names: string[] = [];
  const ext = guessExt(source.name);
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "file") continue;
    // isImgVersionFile expects a relPath that includes the versions dir prefix,
    // but we list from inside the versions dir so pass just the filename with a "./" prefix-less form.
    if (versionFileNameMatches(name, source.stem, ext)) names.push(name);
  }
  return names;
}

function versionFileNameMatches(name: string, stem: string, _ext: string): boolean {
  return versionOfImgFileName(name, stem) !== null;
}

/** Default pair meta for an AI source when none was loaded (mirror of metaForSource). */
export function metaForSource(source: SvgSource, existing: PairMeta | null): PairMeta {
  if (existing !== null) return existing;
  const aiSide: PairSide = { relPath: source.relPath, name: source.name, fingerprint: source.fingerprint };
  const sourceSide: PairSide | null = source.sourcePath === null ? null : {
    relPath: source.sourcePath,
    name: source.sourcePath.split("/").pop() ?? source.sourcePath,
    fingerprint: source.sourceFingerprint ?? "",
  };
  return newPairMeta({
    id: source.id, base: source.base, suffix: source.suffix, dirPath: source.dirPath,
    ai: aiSide, source: sourceSide,
  });
}

function relDir(source: SvgSource, sub: string): string {
  return source.dirPath === "" ? sub : `${source.dirPath}/${sub}`;
}

function guessExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return ".png";
  const e = name.slice(dot).toLowerCase();
  if (e === ".jpg" || e === ".jpeg" || e === ".webp" || e === ".png") return e;
  return ".png";
}

// unused placeholder re-export silenced; kept for symmetry with svgfiles
export { extForFormat, isImageFormat };
