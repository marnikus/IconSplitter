// kinds.ts — the ONE list of history entry kinds (request §7). A kind maps to
// exactly one applier, and it decides whether an entry may be persisted: only
// kinds whose owner exists at boot are stored (request §8).

export const REVIEW_KIND = "review";
export const CHECKS_KIND = "review-checks";
export const VIEW_KIND = "review-view";
export const SETTINGS_KIND = "settings";
export const BATCH_SELECT_KIND = "batch-select";
