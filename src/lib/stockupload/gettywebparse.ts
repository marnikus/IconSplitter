// gettywebparse.ts — how the helper's answer becomes a `GettyWebResult`: what it
// accepted, what Getty rejected, what the page listed, and what a failure may
// say (its code, its scrubbed reason, the names it already took).

import type { GettyWebErrorCode, GettyWebResult } from "./gettywebclient";
import { isRecord } from "../isrecord";
import { redactCredentials, type FtpCredentials } from "./credvault";

function nameList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((name): name is string => typeof name === "string") : [];
}

function parseFailure(raw: unknown, creds: FtpCredentials, status: number): { ok: false; code: GettyWebErrorCode; reason: string } {
  const code = isRecord(raw) && typeof raw.code === "string" ? raw.code as GettyWebErrorCode : "page";
  const reason = isRecord(raw) && typeof raw.reason === "string" && raw.reason.trim() !== ""
    ? redactCredentials(raw.reason.trim(), creds)
    : `Getty web upload failed (HTTP ${status})`;
  if (!isRecord(raw)) return { ok: false, code, reason };
  // A failed batch still says what it accepted: those icons are not re-sent.
  const accepted = nameList(raw.accepted);
  const failed = failedEntries(raw);
  const seen = nameList(raw.seen);
  return {
    ok: false, code, reason,
    ...(accepted.length > 0 ? { accepted } : {}),
    ...(failed.length > 0 ? { failed } : {}),
    ...(seen.length > 0 ? { seen } : {}),
  };
}

function metadataEntries(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.metadata)) return [];
  return raw.metadata.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name),
    status: typeof entry.status === "string" ? entry.status : "unknown",
    ...(isRecord(entry.fields) ? { fields: entry.fields as Record<string, boolean> } : {}),
  }));
}

function failedEntries(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.failed)) return [];
  return raw.failed.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name),
    id: typeof entry.id === "string" ? entry.id : null,
  }));
}

function completionOf(raw: Record<string, unknown>) {
  if (!isRecord(raw.completion)) return null;
  return {
    clicked: raw.completion.clicked === true,
    label: typeof raw.completion.label === "string" ? raw.completion.label : null,
    confirmed: raw.completion.confirmed === true,
  };
}

function parseSuccess(raw: unknown, fallback: string[]): GettyWebResult {
  if (!isRecord(raw) || raw.ok !== true) return { ok: false, code: "page", reason: "unexpected helper response" };
  return {
    ok: true,
    batchId: typeof raw.batchId === "string" ? raw.batchId : null,
    accepted: Array.isArray(raw.accepted) ? raw.accepted.filter((n): n is string => typeof n === "string") : fallback,
    failed: failedEntries(raw),
    completed: raw.completed === true,
    // Absent means "not proven ready", never "ready".
    ...(raw.ready === true ? { ready: true } : {}),
    completion: completionOf(raw),
    metadata: metadataEntries(raw),
  };
}

export { completionOf, failedEntries, metadataEntries, nameList, parseFailure, parseSuccess };
