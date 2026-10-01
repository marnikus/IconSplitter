// types.ts — the durable SVG-generation record shape. API keys are deliberately
// absent: neither a sidecar, preference, report nor history entry can carry one.

export type SvgReviewDecision = "pending" | "approved" | "declined";
type SvgRequestStatus = "in-progress" | "complete" | "partial" | "failed" | "unknown";

export interface SvgUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  actualCostUsd: number | null;
}

export interface SvgManifestItem {
  positionId: number;
  sourceId: string;
  filename: string;
  relativePath: string;
  fingerprint: string;
}

export interface SvgRequestRecord {
  clientRequestId: string;
  providerRequestId: string | null;
  batchId: string;
  status: SvgRequestStatus;
  positionId: number;
  compositeHash: string;
  manifest: SvgManifestItem[];
  prompt: string;
  provider: "Requesty";
  model: string;
  startedAt: string;
  finishedAt: string | null;
  usage: SvgUsage;
  costAllocation: "shared-batch-not-allocated";
  safeError: string | null;
}

export interface SvgValidationRecord {
  valid: boolean;
  visible: boolean;
  viewBox: string | null;
  warnings: string[];
  safeError: string | null;
}

export interface SvgVersionRecord {
  version: number;
  path: string;
  sourceFingerprint: string;
  prompt: string;
  provider: "Requesty";
  model: string;
  createdAt: string;
  review: SvgReviewDecision;
  reviewedAt: string | null;
  requestId: string;
  batchId: string;
  positionId: number;
  compositeHash: string;
  manifest: SvgManifestItem[];
  usage: SvgUsage;
  costAllocation: "shared-batch-not-allocated";
  contentHash: string;
  validation: SvgValidationRecord;
}

export interface SvgSidecar {
  schemaVersion: 1;
  sourceId: string;
  sourcePath: string;
  sourceFingerprint: string;
  requests: SvgRequestRecord[];
  versions: SvgVersionRecord[];
  lastSafeError: string | null;
  updatedAt: string;
}

export interface SvgLoadedVersion extends SvgVersionRecord {
  svg: string | null;
  available: boolean;
  recovered: boolean;
  sourceCurrent: boolean;
}

export interface SvgSourceRow {
  sourceId: string;
  pairId: string;
  filename: string;
  relativePath: string;
  sourceFingerprint: string;
  sidecarPath: string;
  sidecarState: "missing" | "ok" | "corrupt" | "write-failed";
  generation: "pending" | "generating" | "generated" | "failed" | "unknown" | "corrupt" | "recovered" | "recoverable";
  review: SvgReviewDecision;
  requests: SvgRequestRecord[];
  versions: SvgLoadedVersion[];
  newestSvg: string | null;
  newestPath: string | null;
  newestVersion: number | null;
  safeError: string | null;
  recoverableTempPath: string | null;
}

export interface SvgOutput {
  positionId: number;
  declaredTitle: string;
  svg: string;
}

export interface SvgBatchSummary {
  successful: number;
  failed: number;
  missing: number;
  invalid: number;
  unknown: number;
}
