// batchtypes.ts — the shapes one Upload run passes around: its dependencies, the
// progress line, the final summary and the per-item/per-run counters.

import type { DirHandleLike } from "../lib/fs";
import type { LogSpec } from "../lib/log";
import type { BridgeUploadInput, BridgeUploadResult } from "../lib/stockupload/bridgeclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { GettyWebProgress } from "../lib/stockupload/gettyprogress";
import type {
  GettyWebFinishInput, GettyWebResult, GettyWebUploadInput,
} from "../lib/stockupload/gettywebclient";
import type { UploadFormatKey } from "../lib/stockupload/types";

export interface UploadProgressStep {
  /**
   * Verified outcomes only: the files Getty marked "Ready to submit" plus the
   * ones it answered "Upload failed". A picture on a card is not an outcome, so
   * `done` never counts arrival.
   */
  done: number;
  total: number;
  label: string;
  /** The run has returned: the bar stays as the finished state until closed. */
  complete?: boolean;
  /** Files Getty answered with "Upload failed" — always shown, never swallowed. */
  failed?: number;
  /** Files still listed but not validated when the run returned. */
  pending?: number;
  /** Files whose readiness could not be verified at all (page unreadable). */
  unverified?: number;
  /** The user stopped the run: finished, but not a success. */
  cancelled?: boolean;
}

/** What a finished run leaves open: the live batch and the files it never verified. */
export interface GettyWebRetryTarget {
  sessionKey: string;
  /** File names of the icons the run could not call uploaded. */
  names: string[];
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
  closeGettyWebFn?: (bridgeUrl: string, sessionKey: string) => Promise<void>;
  finishGettyWebFn?: (input: GettyWebFinishInput) => Promise<GettyWebResult>;
  /** The shell's log dock; the run writes what went up and what did not. */
  logFn?: (spec: LogSpec) => void;
  /** Live per-file counts of the running upload, for the panel's progress line. */
  gettyWebProgressFn?: (bridgeUrl: string, sessionKey: string) => Promise<GettyWebProgress | null>;
}

export interface UploadBatchSummary {
  uploadedFiles: number;
  failedFiles: number;
  /** Getty files still listed but never validated when the run returned. */
  pendingFiles?: number;
  /** Files whose readiness could not be verified at all (page unreadable). */
  unverifiedFiles?: number;
  /** The open batch to retry, present only while the helper still holds it. */
  retry?: GettyWebRetryTarget | null;
  cancelled: boolean;
  lastError: string | null;
  stagedDir?: string | null;
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
  pendingFiles: number;
  unverifiedFiles: number;
  /** The still-open Getty batch, when the run left unverified files behind. */
  retry: GettyWebRetryTarget | null;
  lastError: string | null;
  stagedDir: string | null;
}
