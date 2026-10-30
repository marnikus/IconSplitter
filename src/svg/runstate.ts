// runstate.ts — mapping runner events and post-run state (prompt §4/§17,
// 2026-10-05). Owns: turning a RunEvent into row/progress state (including the
// started-at stamp the strip ticks from and the "unknown" status of a request
// whose outcome nobody confirmed), re-reading the pair files after a run so
// versions and decisions are exact, and the ONE summary line a run reports
// instead of one toast per file (RULE 5).

import { costText, fmtTokens } from "../lib/svgusage";
import { redact } from "../lib/svgsecret";
import type { DirHandleLike } from "../lib/fs";
import type { RunEvent, RunSummary } from "./runner";
import { loadMetaAt } from "../selection/pairstore";
import { loadSourceIndex, metaPathOfEntry } from "../state/sourceindex";
import { toRow } from "./rowmodel";
import type { RunProgress, SvgRefs, SvgRow } from "./types";
import type { SvgSource } from "./sources";

/** Runner events -> row/progress state. One source of truth per row (RULE 24). */
export function onRunEvent(event: RunEvent, s: RunSetters): void {
  const h = HANDLERS[event.kind];
  if (h) h(event as any, s);
}

type Handler = (e: any, s: RunSetters) => void;

const HANDLERS: Record<string, Handler> = {
  "run-start": (_, s) => { s.setProgress(null); s.setCurrent(null); },
  "item-start": (e, s) => s.setCurrent(e.sourceId),
  "batch-start": (e, s) => s.setProgressFn((prev) => ({
    runId: e.runId, batchId: e.batchId, index: e.index, batches: e.batches, count: e.count, cols: e.cols,
    rows: e.rows, composite: e.composite, hash: e.hash, saved: 0, failed: 0, missing: 0,
    perRequest: e.perRequest, startedAt: e.startedAt, images: e.images, outcomes: prev?.outcomes ?? [],
  })),
  "batch-done": (e, s) => s.setProgressFn((prev) => prev ? { ...prev, saved: e.report.saved, failed: e.report.failed, missing: e.report.missing, outcomes: [...prev.outcomes, e.report] } : prev),
  "item-saved": (e, s) => s.setRowsFn((rows) => rows.map((r) => r.source.id === e.sourceId ? toRow(r.source, e.meta, false) : r)),
  "item-failed": (e, s) => {
    const status = e.failure === "stalled" ? "unknown" : "failed";
    s.setRowsFn((rows) => rows.map((r) => r.source.id === e.sourceId ? { ...r, status, running: false, error: redact(e.error) } : r));
  },
  "cancelled": (_, s) => s.setCurrent(null),
};


/** Functional setters, so a late event never clobbers a concurrent one. */
export interface RunSetters {
  setProgress: (p: RunProgress | null) => void;
  setProgressFn: (fn: (p: RunProgress | null) => RunProgress | null) => void;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
  setCurrent: (id: string | null) => void;
}

/** Re-reads the pair files after a run so history, versions and review are exact. */
export async function reloadSidecars(refs: SvgRefs, sources: SvgSource[], s: RunSetters): Promise<void> {
  const root = refs.root.current as DirHandleLike | null;
  if (!root) return;
  for (const source of sources) {
    const load = await loadMetaAt(root, reloadPathOf(source));
    refs.metas.set(source.id, load.meta);
    s.setRowsFn((rows) => rows.map((r) => (r.source.id === source.id ? toRow(source, load.meta, load.corrupt) : r)));
  }
}

/**
 * Where a finished source's pair file is: the scan recorded it in the index, and
 * a source that never reached the index still derives the path from its AI image.
 */
function reloadPathOf(source: SvgSource): string {
  const entry = loadSourceIndex().get(source.id);
  return entry ? metaPathOfEntry(entry) : source.metaPath;
}

/** The single honest line a finished run reports (RULE 2/4). */
export function summaryLine(summary: RunSummary): string {
  const parts = [`${summary.saved} saved`, `${summary.invalid} invalid`, `${summary.missing} missing`];
  // A request that got no answer at all is named as such, not folded into the
  // per-image counters (RULE 4: the run says which request failed).
  const failed = summary.outcomes.filter((o) => o.status === "failed").length;
  if (failed > 0) parts.push(`${failed} request${failed === 1 ? "" : "s"} failed`);
  if (summary.unknown > 0) {
    parts.push(`${summary.unknown} request${summary.unknown === 1 ? "" : "s"} outcome unknown (not resent)`);
  }
  if (summary.cancelled) parts.push("cancelled");
  const cost = costText({ reported: summary.usage.cost, estimated: summary.estimated });
  return `SVG generation: ${parts.join(" · ")} · ${fmtTokens(summary.usage.total)} tokens · ${cost}`;
}
