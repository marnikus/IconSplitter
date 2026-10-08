// export.ts — the per-icon export record (`export.json` schema v1,
// design §4.3) and the STAGE PLANNER for selective re-export (design §4.4).
// Parsing is tolerant (RULE 13): a corrupt or missing record is null and the
// pipeline rebuilds it — a bad record never destroys valid output files.
// One record per icon, in `<pair-folder>/export/`; no global multi-icon file.

import { isRecord } from "../isrecord";
import type { UploadSettings, SettingsOverrides } from "./settings";
import type { IconMetadata, MetadataValidation } from "./meta";
import type { GeminiUsage } from "./gemini";
import type { OptimizeRecord } from "./optimize";
import { BUILTIN_WRITER } from "./epsconv/builtin";
import type { EpsConverterId } from "./epsconv/types";

export const EXPORT_RECORD_VERSION = 1;

/** The export folder beside a pair: `<pair-folder>/export` (root pairs: `export`). */
export function exportDirOf(dirPath: string): string {
  return dirPath === "" ? "export" : `${dirPath}/export`;
}

/**
 * One pair's artifact stem — the name the files in `export/` carry. The ONLY
 * thing that goes is the app's `_AI` marker (2026-10-08, corrected by the user
 * the same day): every number behind it STAYS, because those digits are what
 * tells one icon from another.
 *
 * * `fog_AI.svg` -> `fog`; `fog_AI_03.svg` -> `fog_03`
 * * `icon-bunny-face_AI_7_04.svg` -> `icon-bunny-face_7_04` (batch + split tails)
 * * `fog_AI_v2.svg` -> `fog_v2` — the approved version stays visible in the name
 * * `chat_bot_2_AI.svg` -> `chat_bot_2`: the `_AI` marker is bookkeeping, the
 *   rest of the name is the icon's
 * * no trailing `_AI` marker (or a tail that is not numeric, e.g. `fog_AI_x`) is
 *   returned unchanged — the name is never invented, only trimmed
 *
 * Two icons never collapse into one name this way: `fog_AI.svg` and
 * `fog_AI_7.svg` are different pairs and stay `fog.*` and `fog_7.*`.
 */
export function stemOf(svgName: string): string {
  return trimArtifactStem(svgName.replace(/\.svg$/i, ""));
}

/**
 * The trim itself, on a name that already lost its extension (`fog_AI_v2` →
 * `fog_v2`, `fog_AI_7_04` → `fog_7_04`, `plain` → `plain`). Exported because the
 * export folder's sweep must recognise the app's own superseded names by exactly
 * the rule that produces the current ones — one rule, one home (RULE 3).
 */
export function trimArtifactStem(stem: string): string {
  const marked = /^(.*)_AI((?:_v?\d+)*)$/i.exec(stem);
  return marked === null ? stem : `${marked[1]}${marked[2]}`;
}

/** The three extensions of an export package, and the only ones a sweep touches. */
export const ARTIFACT_EXTS = ["svg", "jpg", "eps"] as const;

/** Where one pair's committed JPEG lives, whether or not it exists (CP-5). */
export function publishedJpegPath(dirPath: string, svgName: string): string {
  return `${exportDirOf(dirPath)}/${stemOf(svgName)}.jpg`;
}

export type ExportStatus = "processed" | "partial" | "failed" | "cancelled" | "stale" | "interrupted";
export type ExportStage =
  | "discovered" | "preflight" | "prepare" | "metadata" | "render"
  | "optimize" | "embed" | "eps" | "validate" | "commit" | "committed";

export interface OutputRecord {
  path: string;
  bytes: number;
  hash: string;
}

export interface ExportRecord {
  v: number;
  pair: { id: string; base: string; suffix: string; dir: string };
  source: { svgPath: string; version: number; approval: string; fingerprint: string };
  settings: { defaults: UploadSettings; overrides: SettingsOverrides; effective: UploadSettings; fingerprint: string };
  jpeg: { width: number; height: number; megapixels: number; quality: number; profile: string };
  tools: {
    svgo: OptimizeRecord;
    /**
     * `converter`: which converter wrote the EPS (2026-10-09; absent = builtin on
     * older packages); `writer`: the exact tool + version (RULE 22); `fixes`: what
     * the writer adjusted on its own (2026-10-08) — absent on pre-fix packages.
     */
    eps: { enabled: boolean; converter?: EpsConverterId; writer: string; fixes?: string[] };
    /** Strokes expanded to fills (2026-10-09; absent on older packages). */
    expand?: { enabled: boolean; shapes: number };
  };
  metadata: {
    state: "pending" | "generated" | "invalid" | "accepted";
    title: string;
    description: string;
    tags: string[];
    prompt: string;
    provider: string;
    model: string;
    requestId: string | null;
    usage: GeminiUsage;
    cost: number | null;
    costBasis: string;
    fingerprint: string;
    validation: MetadataValidation;
  } | null;
  outputs: { svg: OutputRecord | null; jpg: OutputRecord | null; eps: OutputRecord | null };
  stage: ExportStage;
  status: ExportStatus;
  validation: { svg: boolean; jpeg: boolean; eps: boolean; json: boolean; readback: boolean };
  error: string | null;
  recovery: string;
  timestamps: { preparedAt: string; committedAt: string | null };
}

export interface NewRecordArgs {
  pair: { id: string; base: string; suffix: string; dir: string };
  source: { svgPath: string; version: number; approval: string; fingerprint: string };
  settings: { defaults: UploadSettings; overrides: SettingsOverrides; effective: UploadSettings; fingerprint: string };
  svgo: OptimizeRecord;
  epsEnabled: boolean;
  epsConverter?: EpsConverterId;
  now?: string;
}

/** A fresh record: discovered, nothing rendered, nothing committed. */
export function newExportRecord(args: NewRecordArgs): ExportRecord {
  return {
    v: EXPORT_RECORD_VERSION,
    pair: args.pair,
    source: args.source,
    settings: args.settings,
    jpeg: { width: 0, height: 0, megapixels: 0, quality: args.settings.effective.jpegQuality, profile: "baseline" },
    tools: {
      svgo: args.svgo,
      eps: { enabled: args.epsEnabled, converter: args.epsConverter ?? "builtin", writer: BUILTIN_WRITER, fixes: [] },
      expand: { enabled: false, shapes: 0 },
    },
    metadata: null,
    outputs: { svg: null, jpg: null, eps: null },
    stage: "discovered",
    status: "failed",
    validation: { svg: false, jpeg: false, eps: false, json: false, readback: false },
    error: null,
    recovery: "none",
    timestamps: { preparedAt: args.now ?? new Date().toISOString(), committedAt: null },
  };
}

export function serializeExportRecord(record: ExportRecord): string {
  return JSON.stringify(record, null, 2);
}

/** Stored JSON → record; null when corrupt (the pipeline rebuilds it). */
export function parseExportRecord(raw: unknown): ExportRecord | null {
  if (!isRecord(raw) || raw.v !== EXPORT_RECORD_VERSION) return null;
  const paths = ["pair", "source", "settings", "tools", "tools.svgo", "tools.eps", "outputs", "timestamps"];
  const blocks = paths.map((path) => recordAt(raw, path));
  if (blocks.some((block) => block === null)) return null;
  const [pair, source, settings] = blocks as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
  if (typeof pair.id !== "string") return null;
  if (typeof source.fingerprint !== "string") return null;
  if (typeof settings.fingerprint !== "string") return null;
  return raw as unknown as ExportRecord;
}

function recordAt(raw: Record<string, unknown>, path: string): Record<string, unknown> | null {
  let cur: unknown = raw;
  for (const key of path.split(".")) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return isRecord(cur) ? cur : null;
}

// --- the stage planner lives in exportplan.ts (design §4.4; moved 2026-10-09, RULE 18) ---
export { planStages, recordConverter, type PlanInput, type Stage, type StagePlan } from "./exportplan";

/** The metadata block for a record (null until metadata is accepted). */
export function metadataBlock(meta: IconMetadata, args: {
  prompt: string;
  provider: string;
  model: string;
  requestId: string | null;
  usage: GeminiUsage;
  fingerprint: string;
  validation: MetadataValidation;
}): ExportRecord["metadata"] {
  return {
    state: args.validation.ok ? "accepted" : "invalid",
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    prompt: args.prompt,
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    usage: args.usage,
    cost: null, // Gemini reports no cost — never invented (design §2.8)
    costBasis: "none",
    fingerprint: args.fingerprint,
    validation: args.validation,
  };
}
