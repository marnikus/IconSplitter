// batchhistory.ts — validated records for user-started per-stock uploads.

import { isRecord } from "../isrecord";
import { isFolderPathText, normalizeRootPath } from "../rootpath";
import type { UploadFormatKey } from "./types";

const FORMATS: readonly UploadFormatKey[] = ["raster", "svg", "eps", "zip"];
const SAFE_ID = /^[\w.-]{1,160}$/;

export interface StockUploadHistoryFile {
  itemId: string;
  fileName: string;
  format: UploadFormatKey;
  relPath: string | null;
  fullPath: string | null;
}

export interface StockUploadBatch {
  id: string;
  stockId: string;
  stockName: string;
  uploadedAt: string;
  uploadedCount: number;
  failedCount: number;
  cancelled: boolean;
  /** Optional user-entered upload context; absent on pre-note history rows. */
  note?: string;
  rootPath: string;
  files: StockUploadHistoryFile[];
}

function safeRelativePath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 2048
    && path.split(/[\\/]/).every((part) => part !== "" && part !== "." && part !== ".." && !part.includes(":"));
}

/** Absolute paths are derived only from the exact root path already captured. */
export function fullStockFilePath(rootPath: string, relPath: string | null): string | null {
  if (relPath === null || !isFolderPathText(rootPath) || !safeRelativePath(relPath)) return null;
  return `${normalizeRootPath(rootPath)}\\${relPath.split(/[\\/]/).join("\\")}`;
}

type FileHeader = Record<string, unknown> & { itemId: string; fileName: string; format: UploadFormatKey };

function validFileIdentity(raw: unknown): raw is FileHeader {
  return isRecord(raw) && typeof raw.itemId === "string" && SAFE_ID.test(raw.itemId)
    && typeof raw.fileName === "string" && raw.fileName.length > 0 && raw.fileName.length <= 255
    && typeof raw.format === "string" && FORMATS.includes(raw.format as UploadFormatKey);
}

function relativePathOf(value: unknown): string | null | undefined {
  if (value === null) return null;
  return safeRelativePath(value) ? value : undefined;
}

function parseFile(raw: unknown, rootPath: string): StockUploadHistoryFile | null {
  if (!validFileIdentity(raw)) return null;
  const relPath = relativePathOf(raw.relPath);
  if (relPath === undefined) return null;
  const fullPath = fullStockFilePath(rootPath, relPath);
  if (raw.fullPath !== null && raw.fullPath !== fullPath) return null;
  return { itemId: raw.itemId, fileName: raw.fileName, format: raw.format as UploadFormatKey, relPath, fullPath };
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100000;
}

function rootPathOf(value: unknown): string | null {
  if (value === "") return "";
  if (typeof value !== "string" || !isFolderPathText(value)) return null;
  return normalizeRootPath(value);
}

type BatchHeader = Record<string, unknown> & {
  id: string; stockId: string; stockName: string; uploadedAt: string;
  uploadedCount: number; failedCount: number; cancelled: boolean;
};

function validBatchIdentity(raw: Record<string, unknown>): boolean {
  return typeof raw.id === "string" && SAFE_ID.test(raw.id)
    && typeof raw.stockId === "string" && SAFE_ID.test(raw.stockId)
    && typeof raw.stockName === "string" && raw.stockName.length > 0 && raw.stockName.length <= 120;
}

function validBatchOutcome(raw: Record<string, unknown>): boolean {
  return typeof raw.uploadedAt === "string" && Number.isFinite(Date.parse(raw.uploadedAt))
    && validCount(raw.uploadedCount) && validCount(raw.failedCount) && typeof raw.cancelled === "boolean";
}

function validBatchHeader(raw: unknown): raw is BatchHeader {
  return isRecord(raw) && validBatchIdentity(raw) && validBatchOutcome(raw);
}

function optionalNoteOf(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length <= 1000 ? value : null;
}

function validStoredFiles(raw: BatchHeader & Record<string, unknown>): raw is BatchHeader & Record<string, unknown> & { files: unknown[] } {
  return Array.isArray(raw.files) && raw.files.length <= 3000 && raw.files.length === raw.uploadedCount;
}

/** Rejects malformed batch records instead of partially showing misleading data. */
export function parseStockUploadBatch(raw: unknown): StockUploadBatch | null {
  if (!isRecord(raw) || !validBatchHeader(raw)) return null;
  const rootPath = rootPathOf(raw.rootPath);
  const note = optionalNoteOf(raw.note);
  if (rootPath === null || note === null || !validStoredFiles(raw)) return null;
  const files = raw.files.map((file) => parseFile(file, rootPath));
  if (files.some((file) => file === null)) return null;
  return { id: raw.id, stockId: raw.stockId, stockName: raw.stockName, uploadedAt: raw.uploadedAt,
    uploadedCount: raw.uploadedCount, failedCount: raw.failedCount, cancelled: raw.cancelled,
    ...(note === undefined ? {} : { note }), rootPath, files: files as StockUploadHistoryFile[] };
}
