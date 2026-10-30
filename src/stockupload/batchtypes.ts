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
  done: number;
  total: number;
  label: string;
  /** The run has returned: the bar stays as the finished state until closed. */
  complete?: boolean;
  /** Files that did not upload, so a finished bar can say so. */
  failed?: number;
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
