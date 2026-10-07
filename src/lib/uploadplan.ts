// uploadplan.ts — what a re-export actually has to redo (RULE 9). Owns: the
// settings diff, the stage plan and the "may this existing file be carried
// over?" decision.
//
// The point is that a metadata-only edit must not re-render a 15 MP JPEG, a
// quality change must not rebuild an EPS, and a source change must not silently
// keep yesterday's metadata. Every decision here is derived from fingerprints
// and the settings diff — never from a timestamp or a guess.

import type { UploadSettings } from "./uploadsettings";
import { SETTING_FIELDS } from "./uploadsettings";
import type { ExportFingerprints, ExportRecord, OutputFormat } from "./uploadrecord";
import { changedFields } from "./uploadrecord";

export type Stage = "prepare" | "render" | "optimize" | "embed" | "eps" | "commit";

/** The dependency order every plan is sorted into (DESIGN §6). */
const STAGE_ORDER: readonly Stage[] = ["prepare", "render", "optimize", "embed", "eps", "commit"];

/** The stages that produce the artwork, which a metadata-only edit skips. */
const PREP_STAGES: readonly Stage[] = ["prepare", "render", "optimize"];

const ALL_FORMATS: readonly OutputFormat[] = ["svg", "jpeg", "eps"];

/** No previous record: nothing can have "changed". */
const ZERO_CHANGES: readonly (keyof ExportFingerprints)[] = [];

/** Settings that change the artwork's geometry or its plate. */
const GEOMETRY_FIELDS: readonly (keyof UploadSettings)[] = ["paddingPct", "iconScalePct", "background", "backgroundInSvg", "strokeWidth", "strokeUnit", "square"];

/** Settings that change only the raster's pixels. */
const RASTER_FIELDS: readonly (keyof UploadSettings)[] = ["targetMP", "jpegQuality", "colorProfile", "dpi"];

/** Settings that decide how an existing document is processed, not what it draws. */
const OPTIMIZE_FIELDS: readonly (keyof UploadSettings)[] = ["optimizeSvg"];
const EPS_FIELDS: readonly (keyof UploadSettings)[] = ["includeEps"];

export interface PlanInput {
  fingerprints: ExportFingerprints;
  record: ExportRecord | null;
  /** The effective settings this run would use. */
  effective: UploadSettings;
  want: { svg: boolean; jpeg: boolean; eps: boolean };
  /** Which wanted files are on disk with the hash the record claims. */
  present: Record<OutputFormat, boolean>;
  /** True when there is a metadata record that passes validation. */
  hasMetadata: boolean;
}

export interface ExportPlan {
  stages: Stage[];
  /** Formats that must be written in this run. */
  formats: OutputFormat[];
  /** Formats whose existing file is still correct and may be carried over. */
  reuse: OutputFormat[];
  /** A new provider request is required. */
  needMetadata: boolean;
  /** The accepted metadata must be re-confirmed by a person (never silently kept). */
  metadataReview: boolean;
  /** True when the record is absent or unusable: everything is rebuilt. */
  full: boolean;
  reasons: string[];
}

export function settingsDiff(previous: UploadSettings | null, next: UploadSettings): (keyof UploadSettings)[] {
  if (previous === null) return [...SETTING_FIELDS];
  return SETTING_FIELDS.filter((field) => previous[field] !== next[field]);
}

export function planExport(input: PlanInput): ExportPlan {
  const wanted = wantedFormats(input.want);
  if (input.record === null) return freshPlan(input, wanted);
  const flags = flagsOf(input, input.record);
  const formats = wanted.filter((format) => deliver(format, flags));
  return {
    stages: stagesFor(formats, flags),
    formats,
    reuse: wanted.filter((format) => !formats.includes(format)),
    needMetadata: flags.source || !input.hasMetadata,
    metadataReview: flags.source || flags.geometry || !input.hasMetadata,
    full: false,
    reasons: reasonsFor(flags, formats),
  };
}

/** No usable record: every requested output is built, and the plan says so. */
function freshPlan(input: PlanInput, wanted: OutputFormat[]): ExportPlan {
  const flags = flagsOf(input, null);
  return {
    stages: stagesFor(wanted, flags),
    formats: wanted,
    reuse: [],
    needMetadata: !input.hasMetadata,
    metadataReview: true,
    full: true,
    reasons: ["no usable export record: everything is built again"],
  };
}

/** Which change flags this run is facing; a missing record means "everything". */
function flagsOf(input: PlanInput, record: ExportRecord | null): Flags {
  const diff = settingsDiff(record?.effective ?? null, input.effective);
  const changed = record === null ? ZERO_CHANGES : changedFields(input.fingerprints, record.fingerprints);
  return {
    source: changed.includes("source"),
    geometry: diff.some((field) => GEOMETRY_FIELDS.includes(field)),
    raster: diff.some((field) => RASTER_FIELDS.includes(field)),
    optimize: diff.some((field) => OPTIMIZE_FIELDS.includes(field)) || changed.includes("tools"),
    epsToggle: diff.some((field) => EPS_FIELDS.includes(field)),
    metadataOnly: changed.length === 1 && changed[0] === "metadata",
    present: input.present,
  };
}

type FlagName = "source" | "geometry" | "raster" | "optimize" | "epsToggle" | "metadataOnly";

interface Flags {
  source: boolean;
  geometry: boolean;
  raster: boolean;
  /** The optimiser's version/configuration changed (it also rewrites the SVG). */
  optimize: boolean;
  epsToggle: boolean;
  metadataOnly: boolean;
  present: Record<OutputFormat, boolean>;
}

/** One line per reason, in the order a person would ask about them. */
const REASON_TEXT: [FlagName, string][] = [
  ["source", "the approved source or its version changed"],
  ["geometry", "geometry-affecting settings changed"],
  ["raster", "raster settings changed"],
  ["optimize", "the optimizer configuration or version changed"],
  ["epsToggle", "the EPS option changed"],
  ["metadataOnly", "only the metadata changed"],
];

function reasonsFor(flags: Flags, formats: OutputFormat[]): string[] {
  const reasons = REASON_TEXT.filter(([flag]) => flags[flag]).map(([, text]) => text);
  for (const format of ALL_FORMATS) {
    if (!flags.present[format] && formats.includes(format)) {
      reasons.push(`the ${format.toUpperCase()} output is missing or does not match its record`);
    }
  }
  return reasons.length === 0 ? ["everything requested is already valid"] : reasons;
}

/** Does this format have to be written in this run? */
function deliver(format: OutputFormat, flags: Flags): boolean {
  if (!flags.present[format]) return true;             // missing or corrupt: rebuild it
  if (flags.source || flags.geometry) return true;      // the artwork itself moved
  if (format === "jpeg") return flags.raster || flags.metadataOnly || flags.optimize;
  if (format === "svg") return flags.metadataOnly || flags.optimize;
  return flags.optimize || flags.epsToggle;             // EPS carries no metadata
}

/**
 * The stages the pending formats need, in dependency order. The document is
 * always prepared (in memory) when anything is rendered or written, because both
 * the SVG and the raster come from that one prepared copy.
 */
/** The stages each format needs, before the change flags remove or add any. */
const FORMAT_STAGES: Record<OutputFormat, Stage[]> = {
  svg: ["prepare", "optimize", "embed"],
  jpeg: ["prepare", "render", "optimize", "embed"],
  eps: ["prepare", "render", "optimize", "eps"],
};

/**
 * The stages the pending formats need, in dependency order. The document is
 * always prepared when anything is drawn, because both the SVG output and the
 * raster come from that one prepared copy.
 */
function stagesFor(formats: OutputFormat[], flags: Flags): Stage[] {
  if (formats.length === 0) return [];
  const needed = new Set<Stage>(["commit"]);
  for (const format of formats) for (const stage of FORMAT_STAGES[format]) needed.add(stage);
  if (flags.optimize || flags.raster) needed.add("optimize");
  if (flags.metadataOnly) for (const stage of PREP_STAGES) needed.delete(stage);
  return STAGE_ORDER.filter((stage) => needed.has(stage));
}

function wantedFormats(want: { svg: boolean; jpeg: boolean; eps: boolean }): OutputFormat[] {
  return (["svg", "jpeg", "eps"] as OutputFormat[]).filter((format) => want[format]);
}

export function planSummary(plan: ExportPlan): string {
  if (plan.formats.length === 0) return "up to date";
  return `${plan.formats.join("+")} via ${plan.stages.join("→")}${plan.metadataReview ? " · metadata review" : ""}`;
}
