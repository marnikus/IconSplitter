// reviewfolders.ts — Selection V2 discovers sources, never output/history trees.
// Whole names only, case-insensitive at any depth (including the picked root).
// This is discovery policy, not a restriction on explicit saved-version reads.
import { IMAGE_REGEN_DIR } from "./svgimgreg";

export const REVIEW_EXCLUDED_FOLDERS = ["export", IMAGE_REGEN_DIR, "SVG versions"];

export function isReviewExcludedFolder(name: string): boolean {
  return REVIEW_EXCLUDED_FOLDERS.some((folder) => folder.toLowerCase() === name.toLowerCase());
}
