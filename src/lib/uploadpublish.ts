// uploadpublish.ts — the package's record and its publication (RULE 11/23).
// Owns: filling the `export.json` schema, the atomic commit that only then
// replaces the previous package, and the abandon path that leaves it untouched.
//
// It also owns the pipeline's shared vocabulary — the input, the injected
// dependencies and the run result — so the stage runner, the tests and this file
// agree on one set of types instead of three look-alike copies.

import type { EpsFile } from "./epssvg";
import { effectiveSettings } from "./uploadoverride";
import { isCancelled } from "./uploadjobs";
import { planExport, type ExportPlan } from "./uploadplan";
import type { MetadataCheck, MetadataRecord } from "./uploadmeta";
import type { OverridePatch } from "./uploadoverride";
import type { Artboard } from "./uploadartboard";
import type { UploadSettings } from "./uploadsettings";
import { SVGO_VERSION } from "./svgoptimize";
import {
  hashBytes, metadataFingerprint, settingsFingerprint, sourceFingerprint, toolsFingerprint,
  RECORD_NAME, RECORD_VERSION,
  type ExportFingerprints, type ExportRecord, type ExportStatus, type OutputFile, type OutputFormat,
} from "./uploadrecord";

export { RECORD_NAME };

export interface PipelineSource {
  id: string;
  /** Base name of the icon, without an extension: the export's file stem. */
  name: string;
  path: string;
  code: string;
  /** Hash of the approved bytes; changes when the file changes on disk. */
  hash: string;
  /** The approved version id this code came from. */
  version: string;
}

export interface PipelineInput {
  source: PipelineSource;
  record: ExportRecord | null;
  settings: UploadSettings;
  override: OverridePatch;
  metadata: MetadataRecord;
  metadataCheck: MetadataCheck | null;
  want: { svg: boolean; jpeg: boolean; eps: boolean };
  /** Bytes of the outputs already on disk, for the reuse decision. */
  existing: Partial<Record<OutputFormat, Uint8Array>>;
  createdAt: string;
}

export interface RasterOutcome {
  ok: boolean;
  bytes: Uint8Array | null;
  error: string | null;
  /** Decoded back from the produced bytes, never assumed. */
  width: number;
  height: number;
}

export interface PipelineDeps {
  /** Staged write — into the icon's staging area, not yet published. */
  write: (name: string, data: Uint8Array | string) => Promise<void>;
  /** Publish the staged names; a throw here leaves the previous package alone. */
  commit: (names: readonly string[]) => Promise<void>;
  discard: (names: readonly string[]) => Promise<void>;
  /** Renders the export copy at the artboard's own pixel size and encodes it. */
  raster: (svg: string, artboard: Artboard) => Promise<RasterOutcome>;
  eps: (svg: string, artboard: Artboard) => EpsFile;
  verifyEps: (file: EpsFile) => Promise<{ ok: boolean; label: string; problems: string[] }>;
  log: (entry: { stage: string; message: string; level?: "info" | "warn" | "error" }) => void;
  signal: AbortSignal;
  now: () => string;
}

export interface PipelineRun {
  status: ExportStatus;
  record: ExportRecord;
  /** Outputs written and published by this run. */
  published: OutputFile[];
  /** Outputs carried over from the previous package, verified by hash. */
  reused: OutputFile[];
  warnings: string[];
  error: string | null;
}

/** What the record needs from the run, gathered as the stages go. */
export interface PublishState {
  input: PipelineInput;
  plan: ExportPlan;
  effective: UploadSettings;
  artboard: Artboard | null;
  svgo: ExportRecord["svgo"];
  jpeg: ExportRecord["jpeg"];
  eps: ExportRecord["eps"];
  /** Written by this run, in the order the stages produced them. */
  outputs: OutputFile[];
  /** Carried over from the previous package, verified by hash. */
  reused: OutputFile[];
  warnings: string[];
  partialReason: string | null;
}

/** A stage failure: which stage, and what a person can act on. */
export class StageError extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
    this.name = "StageError";
  }
}

/** The plan for this icon: what has to be rebuilt, and what may be reused. */
export function planRun(input: PipelineInput): ExportPlan {
  return planExport({
    fingerprints: fingerprintsOf(input),
    record: input.record,
    effective: effectiveSettings(input.settings, input.override),
    want: input.want,
    present: presenceOf(input),
    hasMetadata: input.metadataCheck?.ok === true,
  });
}

/** An output counts as present only if its bytes are there AND still hash right. */
function presenceOf(input: PipelineInput): Record<OutputFormat, boolean> {
  const stored = input.record?.outputs ?? [];
  return {
    svg: matchesStored(input.existing.svg, stored.find((file) => file.format === "svg")),
    jpeg: matchesStored(input.existing.jpeg, stored.find((file) => file.format === "jpeg")),
    eps: matchesStored(input.existing.eps, stored.find((file) => file.format === "eps")),
  };
}

function matchesStored(bytes: Uint8Array | undefined, stored: OutputFile | undefined): boolean {
  if (bytes === undefined || stored === undefined) return false;
  return bytes.length === stored.bytes && hashBytes(bytes) === stored.hash;
}

export function fingerprintsOf(input: PipelineInput): ExportFingerprints {
  return {
    source: sourceFingerprint({ hash: input.source.hash, version: input.source.version }),
    settings: settingsFingerprint(input.settings, input.override),
    metadata: metadataFingerprint(input.metadata),
    tools: toolsFingerprint({ svgo: SVGO_VERSION, eps: "epssvg@1", dpi: input.settings.dpi }),
  };
}

/** The record of this run, in both the committed and the abandoned case. */
export function buildRecord(state: PublishState, status: ExportStatus, error: string | null = null): ExportRecord {
  const accepted = status === "processed" || status === "partial";
  return {
    version: RECORD_VERSION,
    ...identityOf(state.input),
    settings: state.input.settings,
    override: state.input.override,
    effective: state.effective,
    dpi: state.effective.dpi,
    strokePx: strokePxOf(state),
    jpeg: state.jpeg,
    svgo: state.svgo,
    eps: state.eps,
    prompt: null, provider: null, tokens: null, cost: null,
    outputs: allOutputs(state),
    warnings: [...state.warnings],
    ...outcomeOf(status, accepted, error),
    validation: validationOf(state, error),
    generatedAt: state.input.createdAt,
    committedAt: accepted ? new Date().toISOString() : null,
    fingerprints: fingerprintsOf(state.input),
  };
}

type Identity = Pick<ExportRecord, "iconId" | "iconName" | "sourcePath" | "sourceHash" | "sourceVersion" | "metadata" | "metadataCheck" | "metadataAcceptedAt">;

/** What the record says about where this package came from. */
function identityOf(input: PipelineInput): Identity {
  return {
    iconId: input.source.id,
    iconName: input.source.name,
    sourcePath: input.source.path,
    sourceHash: input.source.hash,
    sourceVersion: input.source.version,
    metadata: input.metadata,
    metadataCheck: input.metadataCheck,
    metadataAcceptedAt: input.createdAt,
  };
}

/** How the run ended: a committed package, or a record of the interruption. */
function outcomeOf(status: ExportStatus, accepted: boolean, error: string | null): Pick<ExportRecord, "interrupted" | "stage" | "status" | "error"> {
  return { interrupted: !accepted, stage: accepted ? "commit" : "abandon", status, error };
}

function strokePxOf(state: PublishState): number {
  return state.artboard?.strokePx ?? state.input.record?.strokePx ?? 0;
}

function validationOf(state: PublishState, error: string | null): ExportRecord["validation"] {
  const problems = [state.partialReason, error].filter((problem): problem is string => problem !== null);
  return { ok: problems.length === 0, problems };
}

/** Everything the package contains: what this run wrote plus what it kept. */
export function allOutputs(state: PublishState): OutputFile[] {
  const kept = state.reused.filter((file) => !state.outputs.some((out) => out.format === file.format));
  return [...state.outputs, ...kept];
}

/** One output's record line, hashed from the bytes that were really written. */
export function output(
  format: OutputFormat,
  name: string,
  data: Uint8Array | string,
  size: { width: number | null; height: number | null },
): OutputFile {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return { format, name, bytes: bytes.length, hash: hashBytes(bytes), width: size.width, height: size.height };
}

/** Publishes the package. Nothing replaces the old one until `commit` succeeds. */
export async function publish(state: PublishState, deps: PipelineDeps): Promise<PipelineRun> {
  const status: ExportStatus = state.partialReason === null ? "processed" : "partial";
  const record = buildRecord(state, status);
  const names = [...state.outputs.map((file) => file.name), RECORD_NAME];
  await deps.write(RECORD_NAME, JSON.stringify(record, null, 2));
  await deps.commit(names);
  deps.log({ stage: "commit", message: `published ${names.join(", ")}` });
  return { status, record, published: state.outputs, reused: state.reused, warnings: [...state.warnings], error: null };
}

/** Nothing was published: the previous package stays exactly as it was. */
export async function abandon(state: PublishState, deps: PipelineDeps, error: unknown): Promise<PipelineRun> {
  const cancelled = isCancelled(error) || deps.signal.aborted;
  const message = cancelled ? "cancelled before anything was published" : describe(error);
  await deps.discard(stagedNames(state.input.source.name)).catch(() => undefined);
  deps.log({ stage: "abandon", message, level: cancelled ? "warn" : "error" });
  const status: ExportStatus = cancelled ? "cancelled" : "failed";
  return {
    status,
    record: { ...buildRecord(state, status, message), outputs: [] },
    published: [],
    reused: [],
    warnings: [...state.warnings],
    error: message,
  };
}

export function stagedNames(stem: string): string[] {
  return [`${stem}.svg`, `${stem}.jpg`, `${stem}.eps`, RECORD_NAME];
}

export function describe(error: unknown): string {
  if (error instanceof StageError) return `${error.stage}: ${error.message}`;
  return error instanceof Error ? error.message : "unknown error";
}
