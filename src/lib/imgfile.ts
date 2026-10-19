// imgfile.ts — AI source version naming and version-history lookups
// (2026-10-16). Owns the subfolder constant, file naming, the next-version
// rule (existing files + pair history, never overwrites — I-72), and the
// history lookups a row reads (newest valid, chosen/preferred). Mirrors
// src/lib/svgfile.ts for raster images. Pure: no IO.

import { IMAGE_FORMATS, type ImageFormat } from "./svgconnections";
import type { AiVersion, ImgGenStatus } from "./imgmodel";

/** Subfolder holding regenerated AI source versions, beside the pair. */
export const AI_VERSIONS_DIR = "AI source regeneration versions";

/** v1 = original file at the pair's folder; v2+ live inside AI_VERSIONS_DIR. */
const IMG_V1_EXT = ".png";

export function extForFormat(format: ImageFormat): string {
  if (format === "jpeg") return ".jpg";
  if (format === "webp") return ".webp";
  return ".png";
}

export function isImageFormat(v: string): v is ImageFormat {
  return (IMAGE_FORMATS as readonly string[]).includes(v);
}

/** The versioned file NAME (no directory prefix). */
export function imgFileName(stem: string, version: number, ext: string): string {
  if (version <= 1) return `${stem}${ext || IMG_V1_EXT}`;
  return `${stem}_v${version}${ext}`;
}

/** Full relative path from root for a version. v1 stays in dirPath. */
export function imgRelPath(dirPath: string, aiName: string, version: number, ext?: string): string {
  const stem = stemOf(aiName);
  const e = ext ?? extOf(aiName);
  const name = imgFileName(stem, version, e);
  if (version <= 1) return joinPath(dirPath, name);
  return joinPath(joinPath(dirPath, AI_VERSIONS_DIR), name);
}

/** Version encoded in an AI_VERSIONS_DIR filename, or null. */
export function versionOfImgFileName(name: string, stem: string): number | null {
  const base = escape(stem);
  const m = new RegExp(`^${base}_v(\\d+)\\.(png|jpe?g|webp)$`).exec(name);
  return m ? Number(m[1]) : null;
}

/** True if relPath names a version file inside AI_VERSIONS_DIR for this stem. */
export function isImgVersionFile(relPath: string, stem: string, _ext: string): boolean {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? "" : relPath.slice(0, at);
  const file = at < 0 ? relPath : relPath.slice(at + 1);
  if (dir !== AI_VERSIONS_DIR) return false;
  return versionOfImgFileName(file, stem) !== null;
}

/** Next version to write: one past the highest on-disk or recorded,
 *  always ≥ 2 because v1 is the original file that already exists (I-70). */
export function nextImgVersion(
  stem: string, existingFiles: readonly string[], history: readonly AiVersion[],
): number {
  const onDisk = existingFiles.map((n) => versionOfFileNameOnly(n, stem)).filter((v): v is number => v !== null);
  const known = history.map((v) => v.version);
  const prev = Math.max(1, ...onDisk, ...known);
  return prev + 1;
}

/** Newest generated+valid version (by version order). */
export function newestValidImg(versions: readonly AiVersion[]): AiVersion | null {
  const list = versions.filter(usable);
  return list.length > 0 ? list[list.length - 1] : null;
}

/** The version the user explicitly chose, if it is still usable. */
export function preferredImg(versions: readonly AiVersion[], preferred: number | null): AiVersion | null {
  if (preferred === null) return null;
  return versions.find((v) => v.version === preferred && usable(v)) ?? null;
}

/** Version the row must display: preferred > newest valid > null. */
export function chosenImg(versions: readonly AiVersion[], preferred: number | null): AiVersion | null {
  return preferredImg(versions, preferred) ?? newestValidImg(versions);
}

/** Usable = generated and passed validation (decodable, dimensions > 0). */
function usable(v: AiVersion): boolean {
  return v.status === ("generated" as ImgGenStatus) && v.validation.ok
    && v.validation.width > 0 && v.validation.height > 0 && v.validation.bytes > 0;
}

function versionOfFileNameOnly(relPath: string, stem: string): number | null {
  const name = relPath.split("/").pop() ?? relPath;
  return versionOfImgFileName(name, stem);
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : IMG_V1_EXT;
}

function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
