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

export function newestValid(versions: readonly SvgVersion[]): SvgVersion | null {
  const list = versions.filter((v) => v.status === "generated" && v.validation.ok);
  return list.length > 0 ? list[list.length - 1] : null;
}

/**
 * The version the row shows (I-54): the user's choice when that version is still
 * there and usable, else the newest valid one. One function, so a stale choice
 * (a file deleted by hand, a version that failed validation) can never leave a
 * row painting nothing.
 */
export function chosenVersion(versions: readonly SvgVersion[], preferred: number | null): SvgVersion | null {
  return preferredVersion(versions, preferred) ?? newestValid(versions);
}

/** Generated, validated and usable at all — the shared half of both choices. */
function usableVersions(versions: readonly SvgVersion[]): SvgVersion[] {
  return versions.filter((v) => v.status === "generated" && v.validation.ok);
}

/**
 * The version an EXPORT may use (R18). Approving the pair approved the reference
 * pair, not every SVG it produced, so only a review-approved version is eligible:
 * the user's preferred one when it qualifies, else the newest one that does — and
 * null (a visible block) when none does. `chosenVersion` stays the DISPLAY rule,
 * because a reviewer must still see a version that is waiting for review.
 */
export function chosenApprovedVersion(versions: readonly SvgVersion[], preferred: number | null): SvgVersion | null {
  const approved = usableVersions(versions).filter((v) => v.review === "approved");
  const wanted = approved.find((v) => v.version === preferred);
  return wanted ?? approved[approved.length - 1] ?? null;
}

/** Are there usable versions at all — the question the row's message depends on? */
export function hasUsableVersion(versions: readonly SvgVersion[]): boolean {
  return usableVersions(versions).length > 0;
}

/** The chosen version itself — null when the choice cannot be shown. */
export function preferredVersion(versions: readonly SvgVersion[], preferred: number | null): SvgVersion | null {
  if (preferred === null) return null;
  return versions.find((v) => v.version === preferred && v.status === "generated" && v.validation.ok) ?? null;
}

/** The version currently carrying an approval, if any. */
export function approvedVersion(versions: readonly SvgVersion[]): SvgVersion | null {
  const list = versions.filter((v) => v.review === "approved");
  return list.length > 0 ? list[list.length - 1] : null;
}
