// runstate.ts — map runner events and reload persisted rows after generation.
// Owns the event-to-UI projection and the single honest completion summary.

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
  if (event.kind === "batch-start") {
    s.setProgress({
      batchId: event.batchId, batches: event.batches, count: event.count, cols: event.cols,
      rows: event.rows, composite: event.composite, hash: event.hash, saved: 0, failed: 0, missing: 0,
    });
  } else if (event.kind === "batch-done") {
    s.setProgressFn((prev) => (prev ? { ...prev, saved: event.saved, failed: event.failed, missing: event.missing } : prev));
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

/** One completion line, with failed/uncertain outcomes and a safe detail. */
export function summaryLine(summary: RunSummary): string {
  const parts = [`${summary.saved} saved`, ...failureParts(summary), `${summary.invalid} invalid`, `${summary.missing} missing`];
  if (summary.cancelled) parts.push("cancelled");
  if (summary.problems[0]) parts.push(`Detail: ${summary.problems[0]}`);
  const cost = costText({ reported: summary.usage.cost, estimated: summary.estimated });
  return `SVG generation: ${parts.join(" · ")} · ${fmtTokens(summary.usage.total)} tokens · ${cost}`;
}

function failureParts(summary: RunSummary): string[] {
  const parts: string[] = [];
  if (summary.failed > 0) parts.push(summary.failed === 1 ? "1 request failed" : `${summary.failed} requests failed`);
  if (summary.uncertain > 0) {
    const count = summary.uncertain === 1 ? "1 request outcome" : `${summary.uncertain} request outcomes`;
    parts.push(`${count} unknown — not retried`);
  }
  return parts;
}
