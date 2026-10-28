// presets.ts — Stock FTP/FTPS/SFTP preset definitions, protocol-varying field rules
// and validate-on-read normalization (RULE 13/20). Credentials never exist here.

import { isRecord } from "../isrecord";
import type {
  FtpProtocol, StockFormatFlags, StockFtpPreset, StockPresetState, StockTemplate, TlsPolicy, UploadFormatKey,
} from "./types";

export const STOCK_PRESETS_VERSION = 1;
export const MAX_STOCK_PRESETS = 20;
export const TIMEOUT_MIN = 5000;
export const TIMEOUT_MAX = 120000;
export const DEFAULT_TIMEOUT = 30000;

export const SHUTTERSTOCK_PRESET: StockFtpPreset = {
  id: "shutterstock",
  name: "Shutterstock",
  template: "shutterstock",
  protocol: "ftps-explicit",
  host: "ftps.shutterstock.com",
  port: 21,
  remoteDir: "/",
  passive: true,
  tlsPolicy: "strict",
  pinnedCertSha256: "",
  timeoutMs: DEFAULT_TIMEOUT,
};

export const ADOBE_STOCK_PRESET: StockFtpPreset = {
  id: "adobe-stock",
  name: "Adobe Stock",
  template: "adobe-stock",
  protocol: "sftp",
  host: "sftp.contributor.adobestock.com",
  port: 22,
  remoteDir: "/",
  passive: true,
  tlsPolicy: "strict",
  pinnedCertSha256: "",
  timeoutMs: DEFAULT_TIMEOUT,
};

export const BUILTIN_STOCK_PRESETS: readonly StockFtpPreset[] = [
  SHUTTERSTOCK_PRESET,
  ADOBE_STOCK_PRESET,
];

export const DEFAULT_FORMAT_FLAGS: StockFormatFlags = {
  raster: true,
  svg: false,
  eps: true,
  zip: false,
};

export const DEFAULT_STOCK_STATE: StockPresetState = {
  v: STOCK_PRESETS_VERSION,
  presets: [...BUILTIN_STOCK_PRESETS],
  activePresetId: SHUTTERSTOCK_PRESET.id,
  checkedTargets: [SHUTTERSTOCK_PRESET.id],
  formats: DEFAULT_FORMAT_FLAGS,
};

export interface ProtocolFieldSpec {
  usesTls: boolean;
  usesSshHostKey: boolean;
  defaultPort: number;
  unencryptedWarning: boolean;
}

export function presetFieldsOf(protocol: FtpProtocol): ProtocolFieldSpec {
  if (protocol === "sftp") {
    return { usesTls: false, usesSshHostKey: true, defaultPort: 22, unencryptedWarning: false };
  }
  if (protocol === "ftps-implicit") {
    return { usesTls: true, usesSshHostKey: false, defaultPort: 990, unencryptedWarning: false };
  }
  if (protocol === "ftp") {
    return { usesTls: false, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: true };
  }
  return { usesTls: true, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: false };
}

export function normalizeRemoteDir(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const parts = raw.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

export function normalizeCertFingerprint(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^sha-?256:/i, "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
}

function normalizeProtocol(raw: unknown): FtpProtocol {
  if (raw === "sftp" || raw === "ftps-implicit" || raw === "ftp") return raw;
  return "ftps-explicit";
}

function normalizeTlsPolicy(raw: unknown): TlsPolicy {
  return raw === "pinned" || raw === "accept-self-signed" ? raw : "strict";
}

function normalizeTemplate(raw: unknown, id: string): StockTemplate {
  if (raw === "shutterstock" || id === "shutterstock") return "shutterstock";
  if (raw === "adobe-stock" || id === "adobe-stock") return "adobe-stock";
  return "custom";
}

function defaultHostFor(template: StockTemplate): string {
  if (template === "shutterstock") return SHUTTERSTOCK_PRESET.host;
  return template === "adobe-stock" ? ADOBE_STOCK_PRESET.host : "";
}

function clampPort(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : fallback;
  return n >= 1 && n <= 65535 ? n : fallback;
}

function clampTimeout(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_TIMEOUT;
  return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, n));
}

function normalizeHost(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const clean = raw.trim().replace(/^(?:sftp|ftps?):\/\//i, "").replace(/\/.*$/, "");
  return clean.slice(0, 253);
}

function parsePreset(raw: unknown): StockFtpPreset | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id.trim() === "") return null;
  const id = raw.id.trim().slice(0, 48);
  const template = normalizeTemplate(raw.template, id);
  const protocol = normalizeProtocol(raw.protocol);
  const spec = presetFieldsOf(protocol);
  const name = typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name.trim().slice(0, 60) : "Stock FTP";
  return {
    id,
    name,
    template,
    protocol,
    host: normalizeHost(raw.host, defaultHostFor(template)),
    port: clampPort(raw.port, spec.defaultPort),
    remoteDir: normalizeRemoteDir(raw.remoteDir),
    passive: raw.passive !== false,
    tlsPolicy: normalizeTlsPolicy(raw.tlsPolicy),
    pinnedCertSha256: normalizeCertFingerprint(raw.pinnedCertSha256),
    timeoutMs: clampTimeout(raw.timeoutMs),
  };
}

function parseFormats(raw: unknown): StockFormatFlags {
  if (!isRecord(raw)) return DEFAULT_FORMAT_FLAGS;
  return {
    raster: typeof raw.raster === "boolean" ? raw.raster : DEFAULT_FORMAT_FLAGS.raster,
    svg: typeof raw.svg === "boolean" ? raw.svg : DEFAULT_FORMAT_FLAGS.svg,
    eps: typeof raw.eps === "boolean" ? raw.eps : DEFAULT_FORMAT_FLAGS.eps,
    zip: typeof raw.zip === "boolean" ? raw.zip : DEFAULT_FORMAT_FLAGS.zip,
  };
}

function ensureBuiltinsAndDedupe(list: StockFtpPreset[]): StockFtpPreset[] {
  const seen = new Set<string>();
  const out: StockFtpPreset[] = [];
  for (const item of list) {
    if (seen.has(item.id) || out.length >= MAX_STOCK_PRESETS) continue;
    seen.add(item.id);
    out.push(item);
  }
  for (const builtin of BUILTIN_STOCK_PRESETS) {
    if (!seen.has(builtin.id) && out.length < MAX_STOCK_PRESETS) {
      seen.add(builtin.id);
      out.push(builtin);
    }
  }
  return out.length > 0 ? out : [...BUILTIN_STOCK_PRESETS];
}

export function parseStockPresetState(text: string | null): StockPresetState {
  if (!text) return DEFAULT_STOCK_STATE;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== STOCK_PRESETS_VERSION || !Array.isArray(raw.presets)) return DEFAULT_STOCK_STATE;
    const presets = ensureBuiltinsAndDedupe(raw.presets.flatMap((p) => parsePreset(p) ?? []));
    const ids = new Set(presets.map((p) => p.id));
    const activePresetId = typeof raw.activePresetId === "string" && ids.has(raw.activePresetId)
      ? raw.activePresetId : presets[0].id;
    const checkedTargets = Array.isArray(raw.checkedTargets)
      ? raw.checkedTargets.filter((id): id is string => typeof id === "string" && ids.has(id))
      : [presets[0].id];
    return { v: STOCK_PRESETS_VERSION, presets, activePresetId, checkedTargets, formats: parseFormats(raw.formats) };
  } catch {
    return DEFAULT_STOCK_STATE;
  }
}

export function serializeStockPresetState(state: StockPresetState): string {
  return JSON.stringify(parseStockPresetState(JSON.stringify(state)));
}

export function patchStockPreset(
  state: StockPresetState,
  id: string,
  patch: Partial<Omit<StockFtpPreset, "id">>,
): StockPresetState {
  const presets = state.presets.map((cur) => {
    if (cur.id !== id) return cur;
    const nextProtocol = patch.protocol ?? cur.protocol;
    const portChanged = patch.port === undefined && nextProtocol !== cur.protocol;
    const merged = {
      ...cur,
      ...patch,
      port: portChanged ? presetFieldsOf(nextProtocol).defaultPort : (patch.port ?? cur.port),
    };
    return parsePreset(merged) ?? cur;
  });
  return { ...state, presets };
}

export function resetBuiltinStockPreset(state: StockPresetState, id: string): StockPresetState {
  const builtin = BUILTIN_STOCK_PRESETS.find((b) => b.id === id);
  return builtin ? patchStockPreset(state, id, builtin) : state;
}

export function addCustomStockPreset(state: StockPresetState, name = "Custom Stock"): StockPresetState {
  if (state.presets.length >= MAX_STOCK_PRESETS) return state;
  const existing = new Set(state.presets.map((p) => p.id));
  let idx = state.presets.length + 1;
  while (existing.has(`stock-${idx}`)) idx += 1;
  const id = `stock-${idx}`;
  const created: StockFtpPreset = {
    id,
    name: name.trim() || `Stock ${idx}`,
    template: "custom",
    protocol: "ftps-explicit",
    host: "",
    port: 21,
    remoteDir: "/",
    passive: true,
    tlsPolicy: "strict",
    pinnedCertSha256: "",
    timeoutMs: DEFAULT_TIMEOUT,
  };
  return {
    ...state,
    presets: [...state.presets, created],
    activePresetId: id,
    checkedTargets: [...state.checkedTargets, id],
  };
}

export function removeStockPreset(state: StockPresetState, id: string): StockPresetState {
  const target = state.presets.find((p) => p.id === id);
  if (!target || target.template !== "custom" || state.presets.length <= 1) return state;
  const presets = state.presets.filter((p) => p.id !== id);
  return {
    ...state,
    presets,
    activePresetId: state.activePresetId === id ? presets[0].id : state.activePresetId,
    checkedTargets: state.checkedTargets.filter((t) => t !== id),
  };
}

export function toggleTargetPreset(state: StockPresetState, id: string): StockPresetState {
  const has = state.checkedTargets.includes(id);
  const checkedTargets = has ? state.checkedTargets.filter((t) => t !== id) : [...state.checkedTargets, id];
  return { ...state, checkedTargets };
}

export function toggleFormatFlag(state: StockPresetState, key: UploadFormatKey): StockPresetState {
  return { ...state, formats: { ...state.formats, [key]: !state.formats[key] } };
}
