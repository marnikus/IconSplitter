// types.ts — the "SVG to upload" tab's shared shapes (design §3.2/§4.2).
// Kept in one file so the model, the row model, the actions and the UI all
// speak the same language without importing each other.

import type { ExportRecord, ExportStage, ExportStatus } from "../lib/upload/export";
import type { IconMetadata, MetadataValidation } from "../lib/upload/meta";
import type { SentPreview } from "../lib/upload/sentpreview";
import type { GeminiUsage } from "../lib/upload/gemini";
import type { ScanSeq } from "../lib/scanseq";
import type { MetadataJournal } from "./journal";
import type { UploadRowSource } from "./discovery";
import type { UploadCtx } from "./actions";

/** One toast line (mirrors svg/statemodel's Toast). */
export interface Toast {
  msg: string;
  err?: boolean;
}

/**
 * The job's visible status: a pipeline stage while a run is in flight, a
 * terminal record status after, `stale` when fingerprints moved since the last
 * commit, `interrupted` for a metadata request a restart left outcome-unknown.
 */
export type UploadJobStatus = ExportStage | ExportStatus;

/** The metadata half of a row — three independent flags live here (design §4.2). */
export type MetadataState = "empty" | "pending" | "generated" | "invalid" | "accepted" | "interrupted";

export interface UploadMetaState {
  state: MetadataState;
  /** The current editable text; null while empty (the fields start empty). */
  metadata: IconMetadata | null;
  /** The last validation, shown under the fields when the answer was invalid. */
  validation: MetadataValidation | null;
  /** The last request's usage (Gemini reports tokens, never a cost). */
  usage: GeminiUsage;
  /** The safe, redacted cause of the last failure ("" when none). */
  detail: string;
  /** True once the user edited the generated text (accept re-validates). */
  edited: boolean;
}

/** The last answer from the provider's own model list (CP-8). */
export interface ModelCheck {
  state: "idle" | "checking" | "found" | "missing" | "failed";
  detail: string;
}

export const IDLE_MODEL_CHECK: ModelCheck = { state: "idle", detail: "" };

export const EMPTY_META: UploadMetaState = {
  state: "empty", metadata: null, validation: null,
  usage: { input: null, output: null, total: null }, detail: "", edited: false,
};

/** One list row: the approved source plus everything known about its package. */
export interface UploadRow {
  source: UploadRowSource;
  /** The parsed export.json (null = none or corrupt — rebuilt on next export). */
  record: ExportRecord | null;
  /** sha256 of the source SVG at assembly (null = no record, nothing to compare). */
  sourceHash: string | null;
  status: UploadJobStatus;
  /** The stage label while an export run is in flight, else null. */
  stage: ExportStage | null;
  /** Which run owns the row right now, else null. */
  running: "metadata" | "export" | null;
  meta: UploadMetaState;
  /** The safe, redacted cause of the last export failure ("" when none). */
  error: string;
  /** Fingerprints moved since the last commit — shown until re-export. */
  stale: boolean;
}

// --- list filter / sort (rowmodel) ------------------------------------------

export type UploadStatusFilter = "all" | "processed" | "partial" | "failed" | "cancelled" | "stale" | "not-exported";
export type UploadMetaFilter = "all" | "empty" | "pending" | "generated" | "invalid" | "accepted" | "interrupted";
export type UploadSort = "name" | "status" | "metadata";

export interface UploadListFilter {
  status: UploadStatusFilter;
  metadata: UploadMetaFilter;
  search: string;
}

export const ALL_UPLOAD_FILTER: UploadListFilter = { status: "all", metadata: "all", search: "" };

/** The row fields a filter or sort may look at. */
export interface UploadListRow {
  id: string;
  name: string;
  relPath: string;
  status: UploadStatusFilter;
  metadata: UploadMetaFilter;
  approvedValid: number;
}

// --- dialogs ------------------------------------------------------------------

export type UploadDialog =
  | { kind: "settings"; id: string | null } // null = the global defaults
  /**
   * The exact request preview, before any paid send, with the images it carries.
   * `thenExport` names the selection "Export selected" must export once the
   * answers land (empty for the plain "Generate metadata" button).
   */
  | { kind: "meta"; ids: string[]; previews: SentPreview[]; preparing: boolean; thenExport: string[] };

/** The metadata confirmation, narrowed (its own module renders it). */
export type MetaDialog = Extract<UploadDialog, { kind: "meta" }>;

/** A mutable mirror of the context, so async loops read live state (RULE 24). */
export type Latest = { current: UploadCtx };

// --- mutable internals shared by the hook and the actions ----------------------

export interface UploadRefs {
  root: { current: unknown };
  key: { current: string | null };
  abortMeta: { current: AbortController | null };
  abortExport: { current: AbortController | null };
  journal: { current: MetadataJournal };
  /** The key of the committed snapshot: an unchanged scan commits nothing. */
  scanKey: { current: string | null };
  /** Which scan may commit — mutated in place by the scan (see lib/scanseq). */
  seq: ScanSeq;
}
