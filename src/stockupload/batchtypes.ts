// batchtypes.ts — the shapes one Upload run passes around: its dependencies, the
// progress line, the final summary and the per-item/per-run counters.

import type { DirHandleLike } from "../lib/fs";
import type { LogSpec } from "../lib/log";
import type { BridgeUploadInput, BridgeUploadResult } from "../lib/stockupload/bridgeclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { PlannedTransfer, StockUploadPlan } from "../lib/stockupload/plan";
import type { GettyWait, GettyWebProgress } from "../lib/stockupload/gettyprogress";
import type {
  GettyWebFinishInput, GettyWebResult, GettyWebUploadInput,
} from "../lib/stockupload/gettywebclient";
import type { ExportedItem, StockFtpPreset, UploadFormatKey } from "../lib/stockupload/types";

/** Which half of a run the bar is showing: bytes in, or chips validated. */
export type UploadProgressPhase = "uploading" | "verifying";

/** What the Getty run waits for, as the panel counts it down: the helper's reading and when it was taken. */
export interface StepWait extends GettyWait {
  readAt: number;
}

export interface UploadProgressStep {
  done: number;
  total: number;
  label: string;
  /**
   * The stage the counts belong to. `uploading` counts files Getty received;
   * `verifying` counts the cards that turned "Ready to submit". A full upload
   * phase is not a finished run, so the bar may not say "complete" there.
   */
  phase?: UploadProgressPhase;
  /** The run has returned: the bar stays as the finished state until closed. */
  complete?: boolean;
  /** Files that did not upload, so a finished bar can say so. */
  failed?: number;
  /** Identity of this run: the bar's completion cue is keyed by it (2026-11-02). */
  runId?: string;
  /** The user stopped the run: it ended, but it is not a completion. */
  stopped?: boolean;
  /** Getty web: what the helper waits for right now (2026-11-12) — a retry timer or a deadline. */
  wait?: StepWait;
  /** Getty web: what the helper is doing once a wait is over. */
  activity?: string;
  /** Getty web: "Retry now" — asks the helper to skip the running retry timer. */
  skipWait?: () => void;
}

export interface UploadBatchDeps {
  root: DirHandleLike;
  bridgeUrl: string;
  signal: AbortSignal;
  loadCreds: (presetId: string) => Promise<FtpCredentials | null>;
  onProgress?: (step: UploadProgressStep) => void;
  onCertWarning?: (presetId: string, sha256: string) => void;
  uploadFn?: (input: BridgeUploadInput) => Promise<BridgeUploadResult>;
  closeSessionFn?: (bridgeUrl: string, sessionKey: string) => Promise<void>;
  gettyWebUploadFn?: (input: GettyWebUploadInput) => Promise<GettyWebResult>;
  /** Batch size for the Getty web target; the real 100-icon cap unless a test injects one. */
  gettyWebMaxIcons?: number;
  /** Bytes one Getty request may carry; the real helper cap unless a test injects one. */
  gettyWebMaxBytes?: number;
  /**
   * Draw each 100-icon batch at random instead of taking the list in order — the
   * same chip drives the Getty web run and the FTPS/SFTP drops.
   */
  gettyWebRandomBatches?: boolean;
  /** Icons one FTPS/SFTP batch may hold; the real 100 unless a test injects one. */
  ftpMaxIcons?: number;
  /** The shuffle's randomness; `Math.random` unless a test injects one. */
  gettyWebRandomFn?: () => number;
  closeGettyWebFn?: (bridgeUrl: string, sessionKey: string) => Promise<void>;
  finishGettyWebFn?: (input: GettyWebFinishInput) => Promise<GettyWebResult>;
  /** The shell's log dock; the run writes what went up and what did not. */
  logFn?: (spec: LogSpec) => void;
  /** Live per-file counts of the running upload, for the panel's progress line. */
  gettyWebProgressFn?: (bridgeUrl: string, sessionKey: string) => Promise<GettyWebProgress | null>;
  /** "Retry now": skips the helper's running retry timer; the real route unless a test injects one. */
  gettyWebSkipWaitFn?: (bridgeUrl: string, sessionKey: string) => Promise<boolean>;
  /** Every terminal task result, so UI-owned history can keep only successful files. */
  onTaskResult?: (task: PlannedTransfer, result: { ok: true } | { ok: false; reason: string }) => void;
}

export interface UploadBatchSummary {
  uploadedFiles: number;
  failedFiles: number;
  cancelled: boolean;
  lastError: string | null;
  stagedDir?: string | null;
  /** Icons that need a re-upload — what the user has to run again later. */
  reuploadIcons?: number;
}

export interface ItemTracker {
  expected: number;
  succeeded: UploadFormatKey[];
  missingCount: number;
  lastError: string | null;
}

export interface RunCounters {
  done: number;
  total: number;
  uploadedFiles: number;
  failedFiles: number;
  /** Icons still missing after their one retry — the tab's re-upload list. */
  reuploadIcons: number;
  lastError: string | null;
  stagedDir: string | null;
}

/** Everything one target's run needs; shared by every transfer loop. */
export interface NetworkCtx {
  plan: StockUploadPlan;
  target: StockFtpPreset;
  targetTasks: PlannedTransfer[];
  deps: UploadBatchDeps;
  counters: RunCounters;
  trackers: Map<string, ItemTracker>;
  creds: FtpCredentials;
  sessionKey: string;
  itemsById: ReadonlyMap<string, ExportedItem>;
}
