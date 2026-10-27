import { isRecord } from "../isrecord";
import type { TransferFile, TransferManifest } from "./types";
export const HOST_NAME = "com.iconsplitter.stock";
export const PROTOCOL_VERSION = 1;
export const CHUNK_BYTES = 128 * 1024;
export const MAX_FILES = 1000;
export const MAX_BATCH_BYTES = 2_000_000_000;

export function validManifest(raw: unknown): raw is TransferManifest {
  if (!manifestHeader(raw) || !Array.isArray(raw.files)) return false;
  if (raw.files.length === 0 || raw.files.length > MAX_FILES || !raw.files.every(validTransferFile)) return false;
  const files = raw.files as TransferFile[];
  if (files.some(f => f.kind === "eps") && raw.epsReviewed !== true) return false;
  return files.reduce((s, f) => s + f.bytes, 0) <= MAX_BATCH_BYTES
    && new Set(files.map(f => f.name.toLowerCase())).size === files.length
    && new Set(files.map(f => f.id)).size === files.length;
}
function manifestHeader(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw) || raw.v !== 1 || raw.account !== "shutterstock") return false;
  return typeof raw.job === "string" && /^[a-f0-9-]{16,64}$/i.test(raw.job);
}
function validTransferFile(raw: unknown): raw is TransferFile {
  if (!fileIdentity(raw)) return false;
  if (raw.kind !== "jpg" && raw.kind !== "eps") return false;
  const ext = String(raw.name).split(".").slice(-1)[0].toLowerCase();
  if (raw.kind === "eps" ? ext !== "eps" : !["jpg", "jpeg"].includes(ext)) return false;
  return typeof raw.bytes === "number" && Number.isSafeInteger(raw.bytes) && raw.bytes > 0 && raw.bytes <= (raw.kind === "jpg" ? 50_000_000 : 100_000_000);
}
function fileIdentity(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id.length > 1000) return false;
  if (typeof raw.name !== "string" || !safeMediaName(raw.name)) return false;
  return typeof raw.hash === "string" && /^[a-f0-9]{64}$/.test(raw.hash);
}
import { safeMediaName } from "./safety";
