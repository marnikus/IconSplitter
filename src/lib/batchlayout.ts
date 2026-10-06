// batchlayout.ts — the names of the app's own output layout, in one place
// (RULE 10). The Batch tab writes `<dest>/<YYYY-MM>/<YYYY-MM-DD_HH-mm-ss>/…` for
// each run, `dest` being `_split_output` by default, and two rules must agree on
// what that layout looks like: which folder makes a tree "the split output"
// (lib/splitscope, I-38/I-47) and where a copy stops (lib/rootpath, I-28/I-48).
// They read the patterns from here instead of each repeating them.

/** The default destination folder the Batch tab writes its runs into. */
export const OUTPUT_DIR = "_split_output";

/**
 * The app's output folder: `_split_output`, and the tolerant variants a user may
 * have (`_split_output_v2`, `_my_split_output`). A near-miss without the
 * separator (`_splitoutput`) or in the wrong order (`_output_split`) is not it.
 */
export function isSplitDirName(name: string): boolean {
  return /^_.*split.+output/i.test(name);
}

/** A batch month folder: `<YYYY-MM>`. */
export function isMonthName(name: string): boolean {
  return /^\d{4}-\d{2}$/.test(name);
}

/** One batch run: `<YYYY-MM-DD_HH-mm-ss>` — the batch folder a human opens. */
export function isRunStamp(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name);
}
