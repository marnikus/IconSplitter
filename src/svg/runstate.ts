// runstate.ts — mapping runner events and post-run state (prompt §4/§17).
// Owns: turning a RunEvent into row/progress state, re-reading the sidecars
// after a run so versions and decisions are exact, and the ONE summary line a
// run reports instead of one toast per file (RULE 5).

import { costText, fmtTokens } from "../lib/svgusage";
import { redact } from "../lib/svgsecret";
import type { DirHandleLike } from "../lib/fs";
import type { RunEvent, RunSummary } from "./runner";
import { loadSidecar } from "./sidecar";
import { toRow } from "./rowmodel";
import { newestValid } from "../lib/svgfile";
import type { RunProgress, SvgRefs, SvgRow } from "./types";
import type { SvgSource } from "./sources";

/** Runner events -> row/progress state. One source of truth per row (RULE 24). */
export function onRunEvent(event: RunEvent, s: RunSetters): void {
  if (event.kind === "run-start") {
    s.setProgress(null);
  } else if (event.kind === "batch-start") {
    // A new request is in flight: its own counters at zero, the finished
    // requests' outcomes kept so the whole run stays visible (RULE 24).
    s.setProgressFn((prev) => ({
      batchId: event.batchId, index: event.index, batches: event.batches, count: event.count, cols: event.cols,
      rows: event.rows, composite: event.composite, hash: event.hash, saved: 0, failed: 0, missing: 0,
      perRequest: event.perRequest, outcomes: prev?.outcomes ?? [],
    }));
  } else if (event.kind === "batch-done") {
    s.setProgressFn((prev) => (prev
      ? { ...prev, saved: event.report.saved, failed: event.report.failed, missing: event.report.missing, outcomes: [...prev.outcomes, event.report] }
      : prev));
  } else if (event.kind === "item-saved") {
    s.setRowsFn((rows) => rows.map((r) => (r.source.id === event.sourceId
      ? { ...r, sidecar: event.sidecar, newest: newestValid(event.sidecar), status: "generated", running: false, error: null }
      : r)));
  } else if (event.kind === "item-failed") {
    s.setRowsFn((rows) => rows.map((r) => (r.source.id === event.sourceId
      ? { ...r, status: "failed", running: false, error: redact(event.error) }
      : r)));
  }
}

/** Functional setters, so a late event never clobbers a concurrent one. */
export interface RunSetters {
  setProgress: (p: RunProgress | null) => void;
  setProgressFn: (fn: (p: RunProgress | null) => RunProgress | null) => void;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
}

/** Re-reads the sidecars after a run so history, versions and review are exact. */
export async function reloadSidecars(refs: SvgRefs, sources: SvgSource[], s: RunSetters): Promise<void> {
  const root = refs.root.current as DirHandleLike | null;
  if (!root) return;
  for (const source of sources) {
    const load = await loadSidecar(root, source);
    refs.sidecars.set(source.id, load.sidecar);
    s.setRowsFn((rows) => rows.map((r) => (r.source.id === source.id ? toRow(source, load.sidecar, load.corrupt) : r)));
  }
}

/** The single honest line a finished run reports (RULE 2/4). */
export function summaryLine(summary: RunSummary): string {
  const parts = [`${summary.saved} saved`, `${summary.invalid} invalid`, `${summary.missing} missing`];
  if (summary.cancelled) parts.push("cancelled");
  const cost = costText({ reported: summary.usage.cost, estimated: summary.estimated });
  return `SVG generation: ${parts.join(" · ")} · ${fmtTokens(summary.usage.total)} tokens · ${cost}`;
}
