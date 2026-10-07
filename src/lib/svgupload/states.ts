// states.ts — what to do with an icon that already has a package (design §17).
// Pure: the answer is a function of fingerprints, and the request is explicit
// that nothing stale may be silently reused and no paid work may be repeated.
// The decision is stated as a plan the UI can SHOW before a re-export runs, and
// every branch says why in words the user reads.

import type { ExportRecord, ExportStatus, OutputFormat, StageName } from "./exportjson";

export interface RegenInput {
  /** The package beside the icon, or null when there is none (or it is corrupt). */
  record: ExportRecord | null;
  /** size:mtime of the chosen SVG now. */
  sourceFingerprint: string;
  /** The effective settings now. */
  settingsFingerprint: string;
  /** The metadata stored for this icon (accepted, ready to embed). */
  metadataReady: boolean;
  /** Does the stored metadata still describe the current source? */
  metadataFresh: boolean;
  /** Which outputs the user asked for. */
  requested: Record<OutputFormat, boolean>;
  /** Which of the requested outputs exist on disk right now. */
  present: Record<OutputFormat, boolean>;
}

export type RegenAction = "export" | "skip" | "rebuild";

export interface RegenPlan {
  action: RegenAction;
  /** The stages that must run, in order. */
  stages: StageName[];
  /** Why — shown in the UI before anything runs. */
  reason: string;
  /** True when this plan would send a paid metadata request. */
  needsMetadata: boolean;
  /** True when the stored, accepted metadata is reused byte for byte. */
  reusesMetadata: boolean;
}

/**
 * The decision matrix, one rule per row:
 *   · no package                       -> full export
 *   · source changed                   -> rebuild everything, metadata is stale
 *   · settings changed                 -> re-render/re-optimise/embed; metadata kept
 *   · a requested output is missing    -> rebuild that side, metadata kept
 *   · everything matches               -> skip (nothing is touched)
 */
export function planRegeneration(input: RegenInput): RegenPlan {
  if (input.record === null) {
    const hasMeta = input.metadataReady && input.metadataFresh;
    return {
      action: "export", stages: fullStages(input, true), reason: "No package exists for this icon yet.",
      needsMetadata: !hasMeta, reusesMetadata: hasMeta,
    };
  }
  const cause = staleCause(input);
  if (cause !== null) {
    // A source change always regenerates the metadata; a settings change reuses it.
    const fresh = cause !== "source" && input.metadataReady && input.metadataFresh;
    return {
      action: "rebuild", stages: fullStages(input, !fresh, cause === "source"), reason: staleText(cause),
      needsMetadata: !fresh, reusesMetadata: fresh,
    };
  }
  const missing = missingReason(input);
  if (missing !== null) {
    return { action: "rebuild", stages: stagesFor(input, false), reason: missing, needsMetadata: false, reusesMetadata: true };
  }
  return { action: "skip", stages: [], reason: "The package matches the source and the settings — nothing to redo.", needsMetadata: false, reusesMetadata: true };
}

/** Which REQUESTED outputs are not in the package — the wording names them. */
function missingReason(input: RegenInput): string | null {
  const record = input.record as ExportRecord;
  const gone = (["svg", "jpg", "eps"] as OutputFormat[]).filter((f) => input.requested[f] && !input.present[f]);
  if (gone.length > 0) return `These outputs are missing from the package: ${gone.map(label).join(", ")}.`;
  const recorded = record.outputs.filter((o) => input.requested[o.format]).map((o) => o.format);
  const never = (["svg", "jpg", "eps"] as OutputFormat[]).filter((f) => input.requested[f] && !recorded.includes(f));
  if (never.length > 0) return `These outputs were never produced for this icon: ${never.map(label).join(", ")}.`;
  return null;
}

/** The words a user reads: "JPEG", not "JPG". */
function label(format: OutputFormat): string {
  return { svg: "SVG", jpg: "JPEG", eps: "EPS" }[format];
}

type StaleCause = "source" | "settings" | "metadata";

/** A changed source invalidates every dependent, metadata included (§17). */
function staleCause(input: RegenInput): StaleCause | null {
  const record = input.record as ExportRecord;
  if (record.fingerprints.source !== input.sourceFingerprint) return "source";
  if (record.fingerprints.settings !== input.settingsFingerprint) return "settings";
  return input.metadataFresh ? null : "metadata";
}

/** The sentence the user reads, per cause — never a silent rebuild. */
function staleText(cause: StaleCause): string {
  if (cause === "source") return "The chosen SVG changed on disk — the package must be rebuilt, and its metadata no longer describes the current artwork.";
  if (cause === "settings") return "The effective settings changed.";
  return "The stored metadata was generated from an earlier version of this icon.";
}

/** A full rebuild: every stage the requested outputs need, then the commit. */
function fullStages(input: RegenInput, allowMetadata: boolean, force = false): StageName[] {
  return stagesFor(input, allowMetadata, force).concat(["commit"]);
}

/**
 * The stages one package needs. `metadata` is included when the icon has no
 * accepted metadata yet, or when the source moved on and the stored answer no
 * longer describes it — the two cases where a NEW answer is unavoidable.
 */
function stagesFor(input: RegenInput, allowMetadata: boolean, force = false): StageName[] {
  const stages: StageName[] = ["preflight", "prepare"];
  if (allowMetadata && (force || !input.metadataReady || !input.metadataFresh)) stages.push("metadata");
  stages.push("render", "embed");
  if (input.requested.eps) stages.push("eps");
  stages.push("validate");
  return stages;
}

/**
 * The one definition of green: every REQUESTED output was produced and the
 * validation passed. A package that is missing a requested EPS is Partial, and
 * a run that failed is Failed — never anything else (request §16).
 */
export function statusAfter(args: {
  requested: Record<OutputFormat, boolean>;
  produced: Record<OutputFormat, boolean>;
  hardFailure: boolean;
  cancelled: boolean;
  validationOk: boolean;
}): ExportStatus {
  if (args.cancelled) return "cancelled";
  if (args.hardFailure) return "failed";
  const missing = (["svg", "jpg", "eps"] as OutputFormat[]).some((f) => args.requested[f] && !args.produced[f]);
  if (missing || !args.validationOk) return "partial";
  return "processed";
}

/** "Processed" needs words too: the row says exactly what is missing, if anything. */
export function statusNote(status: ExportStatus, missing: readonly OutputFormat[]): string {
  if (status === "partial" && missing.length > 0) return `Partial: ${missing.map(label).join(", ")} not produced.`;
  return { processed: "Every requested output was written and verified.", partial: "Some requested output could not be produced.", failed: "The export failed.", cancelled: "Cancelled — completed packages were kept.", stale: "The source changed since this package was made." }[status];
}
