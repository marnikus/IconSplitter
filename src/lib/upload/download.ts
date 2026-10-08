// download.ts — the rules of "Download all" on the SVG to upload tab (2026-10-08).
//
// Pure: no browser API and no folder handle (RULE 3). It decides WHICH selected
// icons have a finished package (the status the row shows, never a guess), WHICH
// of a package's files belong to it (its record decides; EPS only when that
// export had EPS on), the destination stem (one free name for the whole trio),
// the byte-level proof that a file is the committed one (RULE 15), and the
// sentence the toast and the log carry. The folder I/O is upload/downloadrun.ts;
// the wiring is upload/downloadactions.ts.

import { withVariation } from "../naming";
import { ARTIFACT_EXTS, stemOf, type ExportRecord, type OutputRecord } from "./export";
import { sha256Hex } from "./hash";

/** The kinds a package delivers: the artifact kinds of its export folder. */
export type DeliverableKind = (typeof ARTIFACT_EXTS)[number];

/** Why an icon is not delivered — each reason is a state the row already shows. */
export type SkipReason = "running" | "stale" | "not-exported" | "unfinished";

/** What the planner reads from one row: a projection, so the rule is testable without the row. */
export interface DownloadSubject {
  id: string;
  svgName: string;
  /** The row's own status (processed, partial, failed, cancelled, stale, interrupted, discovered). */
  status: string;
  stale: boolean;
  /** True while an export or metadata run owns the row. */
  running: boolean;
  record: ExportRecord | null;
}

export interface PlannedFile extends OutputRecord {
  kind: DeliverableKind;
}

/** One icon ready to deliver: the files its record names, and what its package does not hold. */
export interface PlannedIcon {
  id: string;
  /** The icon's source file name — what the progress line shows. */
  name: string;
  /** `stemOf(svgName)`: the package's own base name, before any clash suffix. */
  stem: string;
  files: PlannedFile[];
  /** Part of the package, but absent from it (a partial export's EPS, for instance). */
  absent: DeliverableKind[];
  /** The package was exported with EPS switched off: a note, not an error. */
  epsOff: boolean;
}

export interface SkippedIcon {
  id: string;
  name: string;
  reason: SkipReason;
}

export interface DownloadPlan {
  icons: PlannedIcon[];
  skipped: SkippedIcon[];
}

/** One file the run could not deliver: its destination name and the plain reason. */
export interface DownloadFailure {
  name: string;
  why: string;
}

/** What a run did — the counts the sentence and the log are built from. */
export interface DownloadRunResult {
  /** Icons the loop reached. */
  done: number;
  /** A cancel arrived before every icon was reached: the rest were never started. */
  stopped: boolean;
  /** Files written AND proven by a read back. */
  saved: number;
  /** Icons with at least one file saved. */
  savedIcons: number;
  /** Planned files absent, changed on disk, or not produced by their export. */
  missing: number;
  /** Icons written under a suffixed stem (`_v02`…). */
  renamed: number;
  failures: DownloadFailure[];
}

const READY_STATUSES: ReadonlySet<string> = new Set(["processed", "partial"]);

type Verdict = { ok: true; record: ExportRecord } | { ok: false; reason: SkipReason };

/** Plans the checked icons in the list's own order. Reads no file: the bytes are proven when written. */
export function planDownload(subjects: readonly DownloadSubject[], selected: readonly string[]): DownloadPlan {
  const picked = new Set(selected);
  const plan: DownloadPlan = { icons: [], skipped: [] };
  for (const subject of subjects) {
    if (!picked.has(subject.id)) continue;
    const verdict = verdictOf(subject);
    if (verdict.ok) plan.icons.push(plannedIconOf(subject, verdict.record));
    else plan.skipped.push({ id: subject.id, name: subject.svgName, reason: verdict.reason });
  }
  return plan;
}

/** The row decides: a run in flight, stale, never exported, or a last run that did not finish. */
function verdictOf(s: DownloadSubject): Verdict {
  if (s.running) return { ok: false, reason: "running" };
  if (s.stale || s.status === "stale") return { ok: false, reason: "stale" };
  if (s.record === null) return { ok: false, reason: s.status === "discovered" ? "not-exported" : "unfinished" };
  if (READY_STATUSES.has(s.status)) return { ok: true, record: s.record };
  return { ok: false, reason: "unfinished" };
}

/** The package's files. EPS belongs to the package only when the export that wrote it had EPS on. */
function plannedIconOf(s: DownloadSubject, record: ExportRecord): PlannedIcon {
  const files: PlannedFile[] = [];
  const absent: DeliverableKind[] = [];
  for (const kind of ARTIFACT_EXTS) {
    if (kind === "eps" && !record.tools.eps.enabled) continue; // not part of this package
    const out = record.outputs[kind];
    if (out === null) absent.push(kind);
    else files.push({ kind, path: out.path, bytes: out.bytes, hash: out.hash });
  }
  return {
    id: s.id, name: s.svgName, stem: stemOf(s.svgName), files, absent,
    epsOff: !record.tools.eps.enabled,
  };
}

/**
 * The first stem whose names (`.svg`, `.jpg`, `.eps`) are ALL free, so the three
 * files of one icon always share one stem: the plain stem, then `_v02`, `_v03`…
 * `taken` holds lower-case names: the folder's own listing plus the names this
 * run has already reserved. Windows and macOS folders compare names this way.
 */
export function allocateStem(stem: string, taken: ReadonlySet<string>): string {
  for (let v = 1; ; v += 1) {
    const candidate = withVariation(stem, v);
    if (!ARTIFACT_EXTS.some((ext) => taken.has(`${candidate}.${ext}`.toLowerCase()))) return candidate;
  }
}

/** True only for the committed bytes: non-empty, the recorded size and the recorded `sha256:` hash (RULE 15). */
export async function matchesCommitted(bytes: Uint8Array, out: Pick<OutputRecord, "bytes" | "hash">): Promise<boolean> {
  if (bytes.length === 0 || bytes.length !== out.bytes) return false;
  return out.hash === `sha256:${await sha256Hex(bytes)}`;
}

const REASON_LABEL: Record<SkipReason, string> = {
  "not-exported": "not exported",
  stale: "changed since export",
  unfinished: "last export did not finish",
  running: "in progress",
};
const REASON_ORDER: readonly SkipReason[] = ["not-exported", "stale", "unfinished", "running"];

/** "1 not exported, 2 changed since export": the skip reasons counted, in a fixed order. */
export function skipPhrase(skipped: readonly SkippedIcon[]): string {
  return REASON_ORDER.flatMap((reason) => {
    const n = skipped.filter((s) => s.reason === reason).length;
    return n === 0 ? [] : [`${n} ${REASON_LABEL[reason]}`];
  }).join(", ");
}

/** The guard's answer when no selected icon can be delivered: what is wrong, and what to do. */
export function nothingReadyPhrase(plan: DownloadPlan): string {
  const n = plan.skipped.length;
  if (n === 0) return "The selected icons are no longer in the list — rescan the folder";
  return `None of the ${n} selected icon${n === 1 ? "" : "s"} has a finished package (${skipPhrase(plan.skipped)}) — export them first`;
}

/** The one sentence the toast and the log carry: what was saved, and every thing that was not, named. */
export function summarizeDownload(folder: string, plan: DownloadPlan, run: DownloadRunResult): string {
  const parts = [savedPhrase(run, folder)];
  if (plan.skipped.length > 0) parts.push(`${plan.skipped.length} skipped (${skipPhrase(plan.skipped)})`);
  const epsOff = plan.icons.filter((icon) => icon.epsOff).length;
  if (epsOff > 0) parts.push(`${epsOff} without EPS — EPS export is off in Export settings`);
  if (run.missing > 0) parts.push(`${run.missing} missing, changed or not produced — export again`);
  if (run.renamed > 0) parts.push(`${run.renamed} renamed to avoid a clash`);
  if (run.failures.length > 0) parts.push(`${run.failures.length} could not be written`);
  if (run.stopped) parts.push(`stopped after ${run.done} of ${plan.icons.length}`);
  return parts.join(" · ");
}

function savedPhrase(run: DownloadRunResult, folder: string): string {
  if (run.saved === 0) return `Nothing was saved to “${folder}”`;
  return `Saved ${plural(run.saved, "file")} from ${plural(run.savedIcons, "icon")} to “${folder}”`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
