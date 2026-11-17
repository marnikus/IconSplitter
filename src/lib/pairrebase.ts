// pairrebase.ts — the same pair file, read from a root that did not write it
// (I-49). A pair file lives beside its images, so the FILE's own directory is
// the truth about where the pair is now; the paths inside it were relative to
// whatever root was picked when it was written. Rebasing re-points both faces
// AND every generated version's SVG at that directory (their file NAMES never
// change) and recomputes the id exactly as a scan of this root does, so a
// decision — and the artwork it approved — follows the folder between roots.
// Pure: paths in, paths out (RULE 1/3).

import { pairId } from "./pairing";
import type { PairIdentity, PairMeta, PairSide } from "./pairmeta";
import { IMAGE_REGEN_DIR, type ImageVersion } from "./svgimgreg";
import type { SvgVersion } from "./svgmodel";

/** The pair as THIS root sees it: the file's directory and the names it holds. */
export function rebaseMeta(meta: PairMeta, dirPath: string): PairMeta {
  const identity: PairIdentity = {
    id: pairId(dirPath, meta.base, meta.suffix), base: meta.base, suffix: meta.suffix, dirPath,
  };
  return {
    ...meta, ...identity,
    ai: rebaseSide(meta.ai, dirPath),
    source: meta.source === null ? null : rebaseSide(meta.source, dirPath),
    versions: meta.versions.map((v) => rebaseVersion(v, dirPath)),
    imageVersions: rebaseImages(meta.imageVersions, meta.dirPath, dirPath),
  };
}

/** One face, re-pointed at `dirPath`: a face with no file keeps no path either. */
function rebaseSide(side: PairSide, dirPath: string): PairSide {
  const name = side.name === "" ? baseName(side.relPath) : side.name;
  if (side.relPath === "" || name === "") return { ...side, name };
  return { ...side, name, relPath: dirPath === "" ? name : `${dirPath}/${name}` };
}

/**
 * One version's SVG, re-pointed at the pair file's own directory: the document
 * was written beside the images, so its NAME is the truth and the stored
 * folders belonged to the root picked at generation time. A failure recorded
 * no file and keeps its empty path.
 */
function rebaseVersion(version: SvgVersion, dirPath: string): SvgVersion {
  if (version.svgPath === "") return version;
  const name = baseName(version.svgPath);
  if (name === "") return version;
  const relPath = dirPath === "" ? name : `${dirPath}/${name}`;
  return relPath === version.svgPath ? version : { ...version, svgPath: relPath };
}

/** The file name of a stored path; a hand-edited backslash path is forgiven. */
function baseName(relPath: string): string {
  const parts = relPath.split(/[\\/]/).filter((s) => s !== "");
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/**
 * The pair's own regenerated images and image styles, re-pointed the same way
 * (2026-11-17): a file the record wrote inside its own folder — a style's
 * variant beside its pair file, a regeneration in the
 * `AI source regeneration versions` folder — moves WITH that folder, so its
 * preview still resolves. A path outside the record's folder is left exactly as
 * it is: that file does not live here, and moving its path would invent one.
 */
function rebaseImages(versions: readonly ImageVersion[], oldDir: string, newDir: string): ImageVersion[] {
  return versions.map((v) => {
    if (v.file === "") return v;
    const at = v.file.lastIndexOf("/");
    const name = at < 0 ? v.file : v.file.slice(at + 1);
    const tail = tailOf(at < 0 ? "" : v.file.slice(0, at), oldDir);
    if (name === "" || tail === null) return v;
    const folder = [newDir, tail.replace(/^\//, "")].filter((part) => part !== "").join("/");
    const joined = folder === "" ? name : `${folder}/${name}`;
    return joined === v.file ? v : { ...v, file: joined };
  });
}

/** What a file's folder is, relative to the record: "" beside it, "/…" below it, null elsewhere. */
function tailOf(dir: string, oldDir: string): string | null {
  if (dir === oldDir) return "";
  const versionDir = oldDir === "" ? IMAGE_REGEN_DIR : `${oldDir}/${IMAGE_REGEN_DIR}`;
  return dir === versionDir ? `/${IMAGE_REGEN_DIR}` : null;
}
