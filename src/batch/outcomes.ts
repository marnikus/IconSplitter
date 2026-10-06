// outcomes.ts — one finished batch item, and one run, as the per-reference
// status records the next scan reads. Moved out of useBatch (RULE 18 budget);
// pure: the item results plus relPath -> dirPath, nothing else.

import { parseAiName } from "../lib/naming";
import type { SourceStatus } from "../lib/statefile";
import type { Outcome } from "./statewrite";
import type { ItemResult } from "./process";

/** The row's folder for a path, or undefined when the item's row is gone. */
export type RowDirs = Map<string, string>;

/** Keyed records for every finished item whose row is still in the list. */
export function toOutcomes(results: ItemResult[], dirs: RowDirs): Outcome[] {
  return results.flatMap((r) => {
    const dirPath = dirs.get(r.relPath.toLowerCase());
    const parsed = parseAiName(r.relPath.split("/").pop() ?? "");
    if (dirPath === undefined || !parsed) return [];
    return [{ dirPath, base: parsed.base, relPath: r.relPath, status: outcomeStatus(r) }];
  });
}

/** failed -> `unprocessed` (retryable next run); a "missing" message -> deleted. */
export function outcomeStatus(r: ItemResult): SourceStatus {
  if (r.outcome === "processed") return "processed";
  if (r.outcome === "failed") return "unprocessed";
  return r.message?.match(/missing/i) ? "deleted" : "skipped";
}

/** The run's one-line tally for the toast. */
export function tally(results: ItemResult[]): { done: number; skipped: number; failed: number } {
  return {
    done: results.filter((r) => r.outcome === "processed").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    failed: results.filter((r) => r.outcome === "failed").length,
  };
}
