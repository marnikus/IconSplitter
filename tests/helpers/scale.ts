// scale.ts — render-scale budget for the profiling/research suites.
//
// Those suites guard production memoisation by counting work per gesture (download
// plans, bulk summaries, settings resolutions, row presentations). Their assertions
// do not depend on how many rows are on screen, but the row count drove most of the
// suite's render CPU: three 1 000-row profiles alone were ~13s of a 113s coverage
// lane (measured 2026-10-30, docs/archive/2026-10-30-test-time-40).
//
// One case per file keeps the historical full scale as scale evidence; the variant
// cases run at PROFILE_ROWS. `ICONSPLITTER_TEST_SCALE=full` restores every
// historical number, for re-validating the render budget itself.
export const FULL_SCALE = 1000;

/** Rows the variant profiling cases run with by default (scale evidence stays at FULL_SCALE). */
export const PROFILE_ROWS = 250;

/** True only for the exact documented value, so a typo cannot silently shrink evidence. */
export const fullScale = (): boolean => process.env.ICONSPLITTER_TEST_SCALE === "full";

/** `full` at the historical scale, `reduced` in the default gate. */
export const atScale = (full: number, reduced: number): number => (fullScale() ? full : reduced);
