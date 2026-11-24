// renameprogress.ts — live ProcessProgressBar state for bulk upload renaming
// across SVG builder, SVG to upload, and Stock upload. Tracks incremental
// done/total/left/percent, supports mid-batch cancellation, and keeps the
// finished result summary visible until dismissed or replaced by the next run.

import { processTotals, type ProcessStatus } from "../lib/processprogress";
import { createProcessSlot, publishProcess, type ProcessSlot } from "../lib/processslot";

export type RenameSource = "svgBuilder" | "upload" | "stockUpload";

export type RenameItemOutcome =
  | { kind: "disk" }
  | { kind: "pending" }
  | { kind: "unchanged" }
  | { kind: "skipped" }
  | { kind: "failed"; reason: string };

export interface RenameProcessState {
  readonly runId: string;
  readonly source: RenameSource;
  readonly done: number;
  readonly total: number;
  readonly status: ProcessStatus;
  readonly current: string;
  readonly disk: number;
  readonly pending: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly failures: readonly string[];
  readonly cancelling: boolean;
}

export interface RenameSummary {
  readonly msg: string;
  readonly err: boolean;
  readonly changed: number;
}

export interface RenameRun {
  readonly signal: AbortSignal;
  isCancelled(): boolean;
  startItem(name: string): void;
  record(outcome: RenameItemOutcome): void;
  finish(): RenameSummary;
}

const SLOTS: Record<RenameSource, ProcessSlot<RenameProcessState>> = {
  svgBuilder: createProcessSlot<RenameProcessState>(),
  upload: createProcessSlot<RenameProcessState>(),
  stockUpload: createProcessSlot<RenameProcessState>(),
};

const ABORTS: Record<RenameSource, AbortController | null> = {
  svgBuilder: null,
  upload: null,
  stockUpload: null,
};

const NOUNS: Record<RenameSource, string> = {
  svgBuilder: "artboard(s)",
  upload: "icon(s)",
  stockUpload: "package(s)",
};

const PREFIXES: Record<RenameSource, string> = {
  svgBuilder: "builder-rename",
  upload: "upload-rename",
  stockUpload: "stock-rename",
};

let seq = 0;

export function renameSlotOf(source: RenameSource): ProcessSlot<RenameProcessState> {
  return SLOTS[source];
}

export function renamePrefixOf(source: RenameSource): string {
  return PREFIXES[source];
}

function initialState(source: RenameSource, runId: string, total: number): RenameProcessState {
  return {
    runId,
    source,
    done: 0,
    total: Math.max(0, Math.floor(total)),
    status: "running",
    current: "Preparing items…",
    disk: 0,
    pending: 0,
    unchanged: 0,
    skipped: 0,
    failures: [],
    cancelling: false,
  };
}

function applyOutcome(state: RenameProcessState, out: RenameItemOutcome): RenameProcessState {
  const done = Math.min(state.total, state.done + 1);
  if (out.kind === "disk") return { ...state, done, disk: state.disk + 1 };
  if (out.kind === "pending") return { ...state, done, pending: state.pending + 1 };
  if (out.kind === "unchanged") return { ...state, done, unchanged: state.unchanged + 1 };
  if (out.kind === "skipped") return { ...state, done, skipped: state.skipped + 1 };
  return { ...state, done, failures: [...state.failures, out.reason] };
}

function finalStatusOf(state: RenameProcessState, aborted: boolean): ProcessStatus {
  if (aborted) return "cancelled";
  if (state.failures.length > 0) return "failed";
  if (state.disk + state.pending + state.unchanged === 0) return "failed";
  return "completed";
}

function countParts(p: RenameProcessState): string[] {
  const parts: string[] = [];
  const renamed = p.disk + p.pending;
  if (renamed > 0) parts.push(`${renamed} renamed`);
  if (p.pending > 0) parts.push(`${p.pending} ready for first export`);
  if (p.unchanged > 0) parts.push(`${p.unchanged} already had same name`);
  if (p.skipped > 0) parts.push(`${p.skipped} skipped (no metadata)`);
  if (p.failures.length > 0) parts.push(`${p.failures.length} failed (${p.failures[0]})`);
  return parts;
}

export function summarizeRenameState(p: RenameProcessState): RenameSummary {
  const noun = NOUNS[p.source];
  const changed = p.disk + p.pending;
  if (p.status === "cancelled") {
    const tail = countParts(p).join(" · ");
    const msg = `Rename cancelled after ${p.done}/${p.total} ${noun}${tail ? ` · ${tail}` : ""}`;
    return { msg, err: false, changed };
  }
  if (changed === 0 && p.unchanged === 0 && p.failures.length > 0) {
    return { msg: `Could not rename exported files (${p.failures.length} failed) — ${p.failures[0]}`, err: true, changed };
  }
  if (changed === 0 && p.unchanged === 0) {
    return { msg: `No selected ${noun} have Title + Description metadata (${p.skipped} skipped)`, err: true, changed };
  }
  const head = changed > 0
    ? `Renamed ${changed} ${noun} for upload`
    : `${p.unchanged} ${noun} already had same upload file name (no changes needed)`;
  const extras = countParts(p).filter((s) => !(changed > 0 && s === `${changed} renamed`) && !(changed === 0 && s.includes("already had same name")));
  return { msg: [head, ...extras].join(" · "), err: p.failures.length > 0, changed };
}

function makeRunHandle(
  source: RenameSource,
  slot: ProcessSlot<RenameProcessState>,
  controller: AbortController,
  init: RenameProcessState,
): RenameRun {
  let state = init;
  const commit = (next: RenameProcessState): void => {
    if (slot.value?.runId !== state.runId) return;
    state = next;
    publishProcess(slot, state);
  };
  return {
    signal: controller.signal,
    isCancelled: () => controller.signal.aborted,
    startItem: (current) => { if (state.status === "running") commit({ ...state, current }); },
    record: (out) => { if (state.status === "running") commit(applyOutcome(state, out)); },
    finish: () => {
      if (ABORTS[source] === controller) ABORTS[source] = null;
      commit({ ...state, status: finalStatusOf(state, controller.signal.aborted), cancelling: false });
      return summarizeRenameState(state);
    },
  };
}

export function beginRenameRun(source: RenameSource, total: number): RenameRun {
  ABORTS[source]?.abort();
  const controller = new AbortController();
  ABORTS[source] = controller;
  seq += 1;
  const slot = SLOTS[source];
  const init = initialState(source, `${PREFIXES[source]}-${seq}`, total);
  publishProcess(slot, init);
  return makeRunHandle(source, slot, controller, init);
}

export function cancelRenameRun(source: RenameSource): void {
  const slot = SLOTS[source];
  const cur = slot.value;
  if (cur?.status === "running" && !cur.cancelling) {
    publishProcess(slot, { ...cur, cancelling: true });
  }
  ABORTS[source]?.abort();
}

export function dismissRenameRun(source: RenameSource): void {
  if (SLOTS[source].value?.status === "running") return;
  publishProcess(SLOTS[source], null);
}

export function resetAllRenameProgress(): void {
  for (const source of ["svgBuilder", "upload", "stockUpload"] as const) {
    ABORTS[source]?.abort();
    ABORTS[source] = null;
    publishProcess(SLOTS[source], null);
  }
}

export function yieldRenameProgress(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

export function announceBatchRename(
  _source: RenameSource,
  summary: RenameSummary,
  say: (text: string, err?: boolean) => void,
): void {
  say(summary.msg, summary.err);
}

function runningDetail(p: RenameProcessState): string {
  const tail = countParts(p).join(" · ");
  return tail === "" ? p.current : `${p.current} · ${tail}`;
}

function finishedTitle(p: RenameProcessState): string {
  if (p.status === "cancelled") return "Rename for upload cancelled";
  if (p.status === "failed") {
    return p.failures.length > 0 ? "Rename for upload finished with errors" : "Rename for upload — missing metadata";
  }
  return "Rename for upload complete";
}

export function renameBarCopy(p: RenameProcessState): {
  title: string;
  detail: string;
  totals: ReturnType<typeof processTotals>;
} {
  const totals = processTotals({ done: p.done, total: p.total });
  if (p.status === "running") {
    const title = p.cancelling ? "Stopping rename…" : `Renaming for upload · ${totals.left} left`;
    return { title, detail: runningDetail(p), totals };
  }
  const detail = countParts(p).join(" · ") || summarizeRenameState(p).msg;
  return { title: finishedTitle(p), detail, totals };
}
