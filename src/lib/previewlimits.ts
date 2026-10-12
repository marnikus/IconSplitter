// previewlimits.ts — the numbers "Preview splits" runs on, each with its reason
// (design D5/D7). Pure constants: no IO, no React, no canvas. The strip, the cache
// and the session hook all read their budgets from here, so a cap can never be
// applied silently in one place and advertised honestly in another (RULE 4).

/** One thumb's edge, px. A fixed size on purpose: the row zoom slider is a row
 *  thumbnail decision, and a second size control would be a second control (D7/RULE 10). */
export const THUMB_PX = 64;

/** Widest a single chunk canvas gets, px — the per-chunk guard of D7. */
export const MAX_STRIP_PX = 8192;

/** Icons one row's strip ever draws. Beyond this the row says so in text (D7, RULE 4). */
export const MAX_ICONS_PER_ROW = 512;

/** Icons per chunk canvas: as many as fit the width cap at the thumb size (128). */
export const CHUNK_ICONS = MAX_STRIP_PX / THUMB_PX;

/** Cached strip bytes per session; eviction is LRU with visible rows pinned (D6/D7). */
export const CACHE_BYTES = 32 * 1024 * 1024;

/** Debounce before a settings change replans the session (D3, RULE 24). */
export const REPLAN_MS = 250;

/** Rows this far outside the viewport are still planned first (D4). */
export const OVERSCAN_PX = 300;

/** Progress text refreshes at most this often: a 1000-row run must not re-render
 *  the list per finished row (D6 — the counter is for a human, not for the loop). */
export const PROGRESS_MS = 250;
