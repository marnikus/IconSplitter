// stocklog.ts — the Upload (stock FTPS/SFTP/ESP) tab's global-log vocabulary.
// The tab has no log of its own: connection tests and upload runs write their
// outcome to the shell's docked log so a failure keeps its FULL staged server
// diagnosis (protocol stage + HTTP status + error codes) after the toast is
// gone. Specs carry no credential-shaped fields by construction: `detail` is
// the helper's already credential-scrubbed reason, `data` is code scalars.

import type { LogSpec } from "../lib/log";

export const STOCK_FEATURE = "stockUpload";

/** The CLOSED set of actions the tab may emit, in one place for the lock test. */
export const STOCK_LOG_ACTIONS = ["connection-test", "upload-run"] as const;

export type StockLogAction = (typeof STOCK_LOG_ACTIONS)[number];

export type StockLogSpec = Omit<LogSpec, "feature" | "action"> & {
  feature: typeof STOCK_FEATURE;
  action: StockLogAction;
};

export interface ConnectionTestRef {
  presetId: string;
  ok: boolean;
  note: string;
  stage?: string | null;
  httpStatus?: number | null;
  code?: string | null;
}

/** One Test-connection outcome, with the failing stage + server status when it failed. */
export function connectionTestSpec(ref: ConnectionTestRef): StockLogSpec {
  return {
    level: ref.ok ? "info" : "error",
    feature: STOCK_FEATURE,
    action: "connection-test",
    ids: { preset: ref.presetId },
    detail: ref.note,
    data: { stage: ref.stage ?? null, httpStatus: ref.httpStatus ?? null, code: ref.code ?? null },
  };
}

export interface UploadRunRef {
  uploadedFiles: number;
  failedFiles: number;
  cancelled: boolean;
  lastError: string | null;
  espBatchIds: readonly string[];
}

/** One confirmed upload batch outcome (per-file detail lives in the history store + console). */
export function uploadRunSpec(ref: UploadRunRef): StockLogSpec {
  const esp = ref.espBatchIds.length > 0 ? `; Getty ESP draft batch ${ref.espBatchIds.join(", ")} (review & submit in ESP)` : "";
  const detail = ref.failedFiles > 0
    ? `${ref.uploadedFiles} uploaded, ${ref.failedFiles} failed: ${ref.lastError ?? "unknown error"}${esp}`
    : `${ref.uploadedFiles} file(s) uploaded${ref.cancelled ? " before cancel" : ""}${esp}`;
  return {
    level: ref.failedFiles > 0 ? "error" : "info",
    feature: STOCK_FEATURE,
    action: "upload-run",
    detail,
    data: { uploaded: ref.uploadedFiles, failed: ref.failedFiles },
  };
}
