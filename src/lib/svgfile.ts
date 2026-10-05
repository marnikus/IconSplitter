// svgfile.ts — SVG naming and version history (prompt §12/§13).
// Owns: the versioned file names beside each AI image, the next-version rule
// (existing files + the pair file's history), and the history lookups a row
// reads (newest valid, approved version, review tally). The stored record shape
// lives in `lib/svgmodel`; the per-pair file that holds the history lives in
// `lib/pairmeta`. Nothing global is written, and there is no second container.

export { SVG_EXT, NO_COST, parseVersion, isGen, isReview } from "./svgmodel";
export type {
  BatchRef, CostBasis, CostInfo, GenStatus, ReviewStatus, SvgVersion, TokenUsage, ValidationInfo,
} from "./svgmodel";

import { SVG_EXT, type SvgVersion } from "./svgmodel";

/** "fog_architecture_041_AI.png" -> "fog_architecture_041_AI". */
export function svgStem(aiName: string): string {
  const dot = aiName.lastIndexOf(".");
  return dot > 0 ? aiName.slice(0, dot) : aiName;
}

/** v1 keeps the plain name; v2+ are explicit (prompt §12 example). */
export function svgFileName(stem: string, version: number): string {
  return version <= 1 ? `${stem}${SVG_EXT}` : `${stem}_v${version}${SVG_EXT}`;
}

/** Version encoded in a file name, or null when it is not this stem's SVG. */
export function versionOfFileName(name: string, stem: string): number | null {
  if (name === `${stem}${SVG_EXT}`) return 1;
  const m = new RegExp(`^${escape(stem)}_v(\\d+)${escape(SVG_EXT)}$`).exec(name);
  return m ? Number(m[1]) : null;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Next version to write: one past the highest version found on disk OR recorded
 * in the pair file's history, so a regeneration can never overwrite an older SVG.
 */
export function nextVersion(stem: string, existingFiles: readonly string[], history: readonly SvgVersion[]): number {
  const onDisk = existingFiles.map((n) => versionOfFileName(n, stem) ?? 0);
  const known = history.map((v) => v.version);
  return Math.max(0, ...onDisk, ...known) + 1;
}

export interface ReviewTally {
  pending: number;
  approved: number;
  declined: number;
}

export function tallyReviews(versions: readonly SvgVersion[]): ReviewTally {
  const out: ReviewTally = { pending: 0, approved: 0, declined: 0 };
  for (const v of versions) out[v.review]++;
  return out;
}

/** Previewable = generated AND validated; a failed attempt is never shown. */
export function isUsableVersion(v: SvgVersion): boolean {
  return v.status === "generated" && v.validation.ok;
}

export function newestValid(versions: readonly SvgVersion[]): SvgVersion | null {
  const list = versions.filter(isUsableVersion);
  return list.length > 0 ? list[list.length - 1] : null;
}

/**
 * The version the user chose as preferred (2026-10-05), or null when there is
 * no choice, the version is gone, or it stopped being previewable — the row
 * then falls back to the newest valid version instead of showing a broken one.
 */
export function preferredValid(versions: readonly SvgVersion[], preferred: number | null): SvgVersion | null {
  if (preferred === null) return null;
  const found = versions.find((v) => v.version === preferred);
  return found !== undefined && isUsableVersion(found) ? found : null;
}

/** The version currently carrying an approval, if any. */
export function approvedVersion(versions: readonly SvgVersion[]): SvgVersion | null {
  const list = versions.filter((v) => v.review === "approved");
  return list.length > 0 ? list[list.length - 1] : null;
}
