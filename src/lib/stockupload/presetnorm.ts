// presetnorm.ts — Pure string, port, protocol, TLS, and timeout normalizers
// for stock preset persistence (RULE 13/20).

import type { FtpProtocol, TlsPolicy } from "./types";

export const TIMEOUT_MIN = 5000;
export const TIMEOUT_MAX = 120000;
export const DEFAULT_TIMEOUT = 30000;

export function normalizeRemoteDir(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const parts = raw.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

export function normalizeCertFingerprint(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^sha-?256:/i, "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
}

const KNOWN_PROTOCOLS = new Set<string>(["ftps-explicit", "sftp", "esp-https", "ftps-implicit", "ftp"]);

export function normalizeProtocol(raw: unknown, fallback: FtpProtocol = "ftps-explicit"): FtpProtocol {
  return typeof raw === "string" && KNOWN_PROTOCOLS.has(raw) ? (raw as FtpProtocol) : fallback;
}

export function normalizeTlsPolicy(raw: unknown): TlsPolicy {
  return raw === "pinned" || raw === "accept-self-signed" ? raw : "strict";
}

export function clampPort(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : fallback;
  return n >= 1 && n <= 65535 ? n : fallback;
}

export function clampTimeout(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_TIMEOUT;
  return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, n));
}

export function normalizeHost(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const clean = raw.trim().replace(/^(?:https?|sftp|ftps?):\/\//i, "").replace(/\/.*$/, "");
  return clean.slice(0, 253);
}
