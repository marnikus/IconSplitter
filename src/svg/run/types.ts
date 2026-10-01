// run/types.ts — public input/result contracts shared by SVG batch stages.

import type { DirHandleLike } from "../../lib/fs";
import type { SvgBatchSummary, SvgUsage } from "../types";
import type { PreparedBatch } from "../preflight";
import type { SvgPreferences } from "../prefs";

export interface RunBatchInput {
  root: DirHandleLike;
  batch: PreparedBatch;
  prefs: SvgPreferences;
  key: string;
  onStage?: (message: string) => void;
}

export interface RunBatchResult {
  batchId: string;
  clientRequestId: string | null;
  providerRequestId: string | null;
  state: "complete" | "partial" | "failed" | "unknown";
  summary: SvgBatchSummary;
  usage: SvgUsage;
  warning: string | null;
  sidecarFailures: number;
  safeError: string | null;
}
