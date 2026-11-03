// registerprogress.ts — the progress bar behind the two "register what is already
// in the folder" passes (SVGs 2026-11-01, AI sources 2026-11-02). Both do the same
// work — read one folder per pair, then the next — so both drive ONE model: a
// session publishes the folder being read, how many folders settled, and how many
// records each one left behind. The bar in `SvgRegisterProgress.tsx` renders it, and
// because the bar owns the completion cue, a finished pass is always audible.
//
// Reuse, not a second counter: the done/total bookkeeping is lib/processprogress'
// reporter, and the live value is a lib/processslot entry per tab.

import type { ProcessProgress, ProcessStatus } from "../lib/processprogress";
import { createProcessReporter } from "../lib/processprogress";
import { createSlotMap, publishProcess, type ProcessSlot } from "../lib/processslot";
import type { SvgRefs } from "./types";

/** Which pass is running: an SVG pass or the AI-source pass. */
export type RegisterKind = "svg" | "images";

export interface RegisterProgress {
  /** The run this bar reports; the completion cue is keyed by it. */
  id: string;
  kind: RegisterKind;
  done: number;
  total: number;
  /** The pair being read right now — its AI file's name, never a path. */
  current: string;
  phase: "running" | "complete" | "cancelled" | "failed";
  /** New records written so far. */
  registered: number;
  /** Files that matched a pair but could not be read or validated. */
  skipped: number;
}

export interface RegisterSession {
  /** The folder about to be read (the pair's AI file name). */
  reading: (name: string) => void;
  /** That folder finished: what it registered, and what it refused. */
  settled: (counts: { registered: number; skipped: number }) => void;
  /** The whole pass ended: complete, or cancelled when Cancel reached it. */
  finish: () => void;
  /** The pass crashed: its bar ends as failed instead of running forever. */
  fail: () => void;
  /** Cancel was pressed: the pass stops before its next folder. */
  cancelled: () => boolean;
}

const slotOf = createSlotMap<RegisterProgress>();

/** The tab's one register bar (the last pass, or nothing). */
export function registerSlot(refs: SvgRefs): ProcessSlot<RegisterProgress> {
  return slotOf(refs);
}

/** Clears the bar — only its ✕ does this; a finished pass stays visible. */
export function clearRegister(refs: SvgRefs): void {
  publishProcess(registerSlot(refs), null);
}

/** Starts a pass over `total` folders; every folder must settle exactly once. */
export function beginRegister(refs: SvgRefs, kind: RegisterKind, total: number): RegisterSession {
  const slot = registerSlot(refs);
  const stop = { requested: false };
  stops.set(refs, stop);
  let current = "";
  const counts = { registered: 0, skipped: 0 };
  const emit = (last: ProcessProgress) => publishProcess(slot, {
    id: last.runId, kind, done: last.done, total: last.total, current,
    phase: PHASES[last.status],
    registered: counts.registered, skipped: counts.skipped,
  });
  let last: ProcessProgress = { runId: "", done: 0, total: 0, status: "running" };
  const reporter = createProcessReporter(total, (progress) => { last = progress; emit(progress); });
  return {
    reading: (name) => { current = name; emit(last); },
    settled: (settled) => {
      counts.registered += settled.registered;
      counts.skipped += settled.skipped;
      reporter.advance();
    },
    finish: () => { endStop(refs, stop); reporter.finish(stop.requested ? "cancelled" : "completed"); },
    fail: () => { endStop(refs, stop); reporter.finish("failed"); },
    cancelled: () => stop.requested,
  };
}

const PHASES: Record<ProcessStatus, RegisterProgress["phase"]> = {
  running: "running", completed: "complete", cancelled: "cancelled", failed: "failed",
};

/** The running pass of each tab, so the bar's Cancel can reach it. */
const stops = new WeakMap<SvgRefs, { requested: boolean }>();

function endStop(refs: SvgRefs, stop: { requested: boolean }): void {
  if (stops.get(refs) === stop) stops.delete(refs);
}

/** The bar's Cancel: the running pass stops before its next folder; false when none runs. */
export function cancelRegister(refs: SvgRefs): boolean {
  const stop = stops.get(refs);
  if (stop === undefined || stop.requested) return false;
  stop.requested = true;
  return true;
}

/** The bar's lifecycle state. */
export function registerStatusOf(p: Pick<RegisterProgress, "phase">): ProcessStatus {
  return p.phase === "complete" ? "completed" : p.phase;
}

/** One honest line for the bar's detail while it runs. */
export function registerDetail(p: RegisterProgress): string {
  if (p.phase === "running") return p.current === "" ? "Reading the selected folders…" : p.current;
  const skipped = p.skipped === 0 ? "" : ` · ${p.skipped} skipped`;
  return `${p.registered} registered${skipped}`;
}

/**
 * What this run has actually written so far, in the same line as what is left:
 * "3 remaining" answers how much work is pending, this answers what it produced.
 * Only while running — a finished bar already says it in its detail line.
 */
export function registerNote(p: RegisterProgress): string {
  if (p.phase !== "running") return "";
  if (p.registered === 0) return "no new files yet";
  return `${p.registered} new file${p.registered === 1 ? "" : "s"} registered`;
}

/** The bar's title: what is happening, in the tab's own words. */
export function registerTitle(p: RegisterProgress): string {
  const what = p.kind === "svg" ? "existing SVGs" : "AI sources";
  const folders = `${p.total} folder${p.total === 1 ? "" : "s"}`;
  if (p.phase === "running") return `Registering ${what} · ${folders}`;
  if (p.phase === "cancelled") return `Registering ${what} cancelled`;
  if (p.phase === "failed") return `Registering ${what} stopped with an error`;
  return `Registering ${what} complete`;
}
