// types.ts — domain vocabulary for the "Upload" (stock FTP/FTPS) tab.

import type { ExportRecord } from "../upload/export";

export type FtpProtocol =
  | "esp-batch" | "esp-https" | "getty-web" | "ftps-explicit" | "sftp" | "ftps-implicit" | "ftp";
export type TlsPolicy = "strict" | "pinned" | "accept-self-signed";
export type StockTemplate = "shutterstock" | "adobe-stock" | "getty-images" | "getty-web" | "custom";
export type UploadFormatKey = "raster" | "svg" | "eps" | "zip";

export interface StockFormatFlags {
  raster: boolean;
  svg: boolean;
  eps: boolean;
  zip: boolean;
}

export interface StockFtpPreset {
  id: string;
  name: string;
  template: StockTemplate;
  protocol: FtpProtocol;
  host: string;
  port: number;
  remoteDir: string;
  passive: boolean;
  tlsPolicy: TlsPolicy;
  pinnedCertSha256: string;
  timeoutMs: number;
}

export interface StockTargetOptions {
  formats: StockFormatFlags;
  combineTitleDescription: boolean;
}

export interface StockPresetState {
  v: 1 | 2 | 3;
  presets: StockFtpPreset[];
  activePresetId: string;
  checkedTargets: string[];
  targetOptions?: Record<string, StockTargetOptions>;
  formats: StockFormatFlags;
}

export interface ExportedFileRef {
  relPath: string;
  fileName: string;
  bytes: number;
  mtime: number;
  ext: "jpg" | "png" | "svg" | "eps" | "zip";
}

export interface ExportedFiles {
  raster: ExportedFileRef | null;
  svg: ExportedFileRef | null;
  eps: ExportedFileRef | null;
  zip: ExportedFileRef | null;
}

export interface ExportedItem {
  id: string;
  stem: string;
  exportDir: string;
  recordPath: string;
  record: ExportRecord;
  files: ExportedFiles;
  missingRecorded: string[];
  /**
   * The source item's pair file under the scanned folder (its approval lives
   * there), or null when it is not under this folder — e.g. an export folder
   * picked on its own. Absent when the scan did not look (2026-11-06).
   */
  source?: { id: string; metaPath: string } | null;
}

export type StockUploadOutcome = "uploaded" | "partial" | "failed" | "interrupted";

export interface StockSiteStatus {
  status: StockUploadOutcome;
  formats: UploadFormatKey[];
  uploadedAt: string;
  error: string | null;
}

export type StockHistoryMap = Record<string, Record<string, StockSiteStatus>>;
