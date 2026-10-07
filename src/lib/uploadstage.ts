// uploadstage.ts — the job's stage order and what must be true before it runs
// (DESIGN §6/§7). Owns: the canonical stage list, the human label for each one,
// the preflight verdict, and the rule that a cut-short job comes back as
// "Interrupted / needs review" instead of silently continuing.
//
// The stage list here is the ORDER the panel reports; the pipeline decides which
// stages a given re-export actually has to run (`uploadplan.ts`). One list, one
// direction: a reader must never have to work out which order is true.

import type { ExportRecord } from "./uploadrecord";

export const RUN_STAGES = [
  "discovered", "preflight", "prepare", "metadata", "render", "optimize",
  "embed", "eps", "validate", "commit", "processed",
] as const;

export type RunStage = (typeof RUN_STAGES)[number];

const LABELS: Record<RunStage, string> = {
  discovered: "Discovered",
  preflight: "Preflight",
  prepare: "Prepare",
  metadata: "Metadata",
  render: "Render",
  optimize: "Optimize",
  embed: "Embed",
  eps: "EPS",
  validate: "Validate",
  commit: "Commit",
  processed: "Processed",
};

export function stageLabel(stage: string): string {
  return LABELS[stage as RunStage] ?? stage;
}

export function stageIndex(stage: string): number {
  const index = RUN_STAGES.indexOf(stage as RunStage);
  return index < 0 ? -1 : index;
}

/** "Prepare → Render → Commit", for a row's progress line. */
export function stageTrail(stages: readonly string[]): string {
  return stages.map(stageLabel).join(" → ");
}

export type PreflightLevel = "block" | "warn";

export interface PreflightItem {
  id: string;
  level: PreflightLevel;
  message: string;
}

export interface PreflightInput {
  folderOpen: boolean;
  /** Approved SVGs in the list. */
  approved: number;
  /** Rows the run will touch. */
  selected: number;
  /** Of those, how many still need metadata generated. */
  needsMetadata: number;
  /** EPS was asked for, and no renderer is available to confirm it draws. */
  wantsEps: boolean;
  epsRenderer: boolean;
  /** A key is stored locally (never in Git, never in a record). */
  keyPresent: boolean;
}

export interface Preflight {
  items: PreflightItem[];
  blockers: string[];
  warnings: string[];
  ok: boolean;
}

/**
 * Everything that must be true before a paid, disk-writing run starts. A blocker
 * stops the run; a warning is a thing the user has already been told about but
 * that does not by itself make the export dishonest — a requested EPS that cannot
 * be produced is exactly that: SVG + JPEG still export, and the package is
 * Partial.
 */
export function preflight(input: PreflightInput): Preflight {
  const items: PreflightItem[] = [];
  if (!input.folderOpen) items.push({ id: "folder", level: "block", message: "Open the folder holding the approved SVGs first." });
  if (input.approved === 0) items.push({ id: "approved", level: "block", message: "No approved SVGs were found; nothing to export." });
  if (input.selected === 0) items.push({ id: "selection", level: "warn", message: "Nothing is selected — select icons, or use Export all." });
  if (input.needsMetadata > 0 && !input.keyPresent) {
    items.push({ id: "key", level: "block", message: `${input.needsMetadata} icon(s) still need metadata, and no API key is stored on this device.` });
  }
  if (input.wantsEps && !input.epsRenderer) {
    items.push({ id: "eps", level: "warn", message: "No PostScript renderer is available here: EPS is generated from the vectors and checked structurally, but its renderability cannot be confirmed on this machine." });
  }
  const blockers = items.filter((item) => item.level === "block").map((item) => item.message);
  const warnings = items.filter((item) => item.level === "warn").map((item) => item.message);
  return { items, blockers, warnings, ok: blockers.length === 0 };
}

/** A package that was never committed, or one whose inputs have moved since. */
export function reviewState(record: ExportRecord | null, fingerprints: ExportRecord["fingerprints"] | null): string {
  if (record === null) return "not exported yet";
  if (record.interrupted) return "Interrupted — needs review";
  if (record.status === "failed" || record.status === "cancelled") return "Interrupted — needs review";
  if (fingerprints !== null && record.fingerprints.source !== fingerprints.source) return "source changed — needs review";
  if (fingerprints !== null && record.fingerprints.metadata !== fingerprints.metadata) return "metadata changed — needs re-export";
  if (!record.validation.ok) return `not valid: ${record.validation.problems.join("; ")}`;
  return "up to date";
}

/** True when a stored record may be shown as the icon's package. */
export function isCommitted(record: ExportRecord | null): boolean {
  return record !== null && !record.interrupted && (record.status === "processed" || record.status === "partial");
}

/** The stage a row is at, from whatever the record says last happened. */
export function currentStage(record: ExportRecord | null, progress: string | null): RunStage {
  if (progress !== null) return "render";
  if (record === null) return "discovered";
  if (record.status === "processed" || record.status === "partial") return "processed";
  return record.stage === "abandon" ? "validate" : (record.stage as RunStage);
}
