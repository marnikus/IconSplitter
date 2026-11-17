// pairrebase.ts — the same pair file, read from a root that did not write it
// (I-49). A pair file lives beside its images, so the FILE's own directory is
// the truth about where the pair is now; the paths inside it were relative to
// whatever root was picked when it was written. Rebasing re-points both faces
// AND every generated version's SVG at that directory (their file NAMES never
// change) and recomputes the id exactly as a scan of this root does, so a
// decision — and the artwork it approved — follows the folder between roots.
// Pure: paths in, paths out (RULE 1/3).

import { pairId } from "./pairing";
import { baseRowId, styleOfFolder, STYLE_ID_SEP } from "./svgstyles";
import { imageRegenDir, type ImageVersion } from "./svgimgreg";
import type { PairIdentity, PairMeta, PairSide } from "./pairmeta";
import type { SvgVersion } from "./svgmodel";

/** The pair as THIS root sees it: the file's directory and the names it holds. */
export function rebaseMeta(meta: PairMeta, dirPath: string): PairMeta {
  const identity: PairIdentity = {
    id: rebasedId(meta, dirPath), base: meta.base, suffix: meta.suffix, dirPath,
  };
  return {
    ...meta, ...identity,
    ai: rebaseSide(meta.ai, dirPath),
    source: meta.source === null ? null : rebaseSide(meta.source, dirPath),
    versions: meta.versions.map((v) => rebaseVersion(v, dirPath)),
    imageVersions: meta.imageVersions.map((v) => rebaseImageVersion(v, meta.dirPath, dirPath)),
  };
}

/**
 * The rebased id (2026-11-17): a STYLE pair's id is its BASE pair's id plus the
 * style (`<pairId>~<style>`), and the base pair lives one folder up — beside
 * `_<style>`, not in it. Re-deriving from the file's own directory dropped or
 * mis-anchored the identity, so a restart forgot the registered style until it
 * was registered again; the pair half is re-derived from the base folder and
 * the style half kept, so the id follows the folder between roots (I-49).
 */
function rebasedId(meta: PairMeta, dirPath: string): string {
  const base = baseRowId(meta.id);
  if (base === meta.id) return pairId(dirPath, meta.base, meta.suffix);
  const style = meta.id.slice(base.length + STYLE_ID_SEP.length);
  const at = dirPath.lastIndexOf("/");
  const folder = dirPath.slice(at + 1);
  const baseDir = styleOfFolder(folder) === style ? dirPath.slice(0, Math.max(0, at)) : dirPath;
  return `${pairId(baseDir, meta.base, meta.suffix)}${STYLE_ID_SEP}${style}`;
}

/**
 * One AI-source version's file, re-pointed like the faces (2026-11-17): a
 * regeneration lives in the pair's version folder and a registered copy beside
 * the pair, so a record in EITHER follows the folder into the reading root —
 * without this, a root picked again left every chosen regeneration unreadable
 * while the original still showed. A record whose folder is neither keeps its
 * stored path untouched: re-pointing it would be a guess.
 */
function rebaseImageVersion(version: ImageVersion, fromDir: string, dirPath: string): ImageVersion {
  const name = baseName(version.file);
  if (name === "") return version;
  const at = version.file.lastIndexOf("/");
  const dir = at === -1 ? "" : version.file.slice(0, at);
  const moved = dir === fromDir ? dirPath : dir === imageRegenDir(fromDir) ? imageRegenDir(dirPath) : null;
  if (moved === null) return version;
  return { ...version, file: moved === "" ? name : `${moved}/${name}` };
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
