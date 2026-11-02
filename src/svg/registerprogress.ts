// registerprogress.ts — the progress bar behind the two "register what is already
// in the folder" passes (SVGs 2026-11-01, AI sources 2026-11-02). Both do the same
// work — read one folder per pair, then the next — so both drive ONE model: a
// session publishes the folder being read, how many folders settled, and how many
// records each one left behind. The bar in `RegisterProgress.tsx` renders it, and
// because the bar owns the completion cue, a finished pass is always audible.
//
// Reuse, not a second counter: the done/total bookkeeping is lib/processprogress'
// reporter, and the live value is a lib/processslot entry per tab.

import type { ProcessProgress } from "../lib/processprogress";
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
  phase: "running" | "complete";
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
  /** The whole pass finished: the bar turns green at 100 %. */
  finish: () => void;
}

const slotOf = createSlotMap<RegisterProgress>();

/** The tab's one register bar (the last pass, or nothing). */
export function registerSlot(refs: SvgRefs): ProcessSlot<RegisterProgress> {
  return slotOf(refs);
}

/** Clears the bar (its ✕, or the auto-hide after a finished pass). */
export function clearRegister(refs: SvgRefs): void {
  publishProcess(registerSlot(refs), null);
}

/** Starts a pass over `total` folders; every folder must settle exactly once. */
export function beginRegister(refs: SvgRefs, kind: RegisterKind, total: number): RegisterSession {
  const slot = registerSlot(refs);
  let current = "";
  const counts = { registered: 0, skipped: 0 };
  const emit = (last: ProcessProgress) => publishProcess(slot, {
    id: last.runId, kind, done: last.done, total: last.total, current,
    phase: last.status === "running" ? "running" : "complete",
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
    finish: () => reporter.finish("completed"),
  };
}

/** One honest line for the bar's detail while it runs. */
export function registerDetail(p: RegisterProgress): string {
  if (p.phase === "running") return p.current === "" ? "Reading the selected folders…" : p.current;
  const skipped = p.skipped === 0 ? "" : ` · ${p.skipped} skipped`;
  return `${p.registered} registered${skipped}`;
}

/** The bar's title: what is happening, in the tab's own words. */
export function registerTitle(p: RegisterProgress): string {
  const what = p.kind === "svg" ? "existing SVGs" : "AI sources";
  const folders = `${p.total} folder${p.total === 1 ? "" : "s"}`;
  if (p.phase === "running") return `Registering ${what} · ${folders}`;
  return `Registering ${what} complete`;
}
