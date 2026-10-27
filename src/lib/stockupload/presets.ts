// presets.ts — Stock FTP/FTPS preset definitions, protocol-varying field rules
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

export const DEFAULT_FORMAT_FLAGS: StockFormatFlags = {
  raster: true,
  svg: false,
  eps: true,
  zip: false,
};

export const DEFAULT_STOCK_STATE: StockPresetState = {
  v: STOCK_PRESETS_VERSION,
  presets: [SHUTTERSTOCK_PRESET],
  activePresetId: SHUTTERSTOCK_PRESET.id,
  checkedTargets: [SHUTTERSTOCK_PRESET.id],
  formats: DEFAULT_FORMAT_FLAGS,
};

export interface ProtocolFieldSpec {
  usesTls: boolean;
  defaultPort: number;
  unencryptedWarning: boolean;
}

export function presetFieldsOf(protocol: FtpProtocol): ProtocolFieldSpec {
  if (protocol === "ftps-implicit") return { usesTls: true, defaultPort: 990, unencryptedWarning: false };
  if (protocol === "ftp") return { usesTls: false, defaultPort: 21, unencryptedWarning: true };
  return { usesTls: true, defaultPort: 21, unencryptedWarning: false };
}

export function normalizeRemoteDir(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const parts = raw.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

export function normalizeCertFingerprint(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
}

function normalizeProtocol(raw: unknown): FtpProtocol {
  return raw === "ftps-implicit" || raw === "ftp" ? raw : "ftps-explicit";
}

function normalizeTlsPolicy(raw: unknown): TlsPolicy {
  return raw === "pinned" || raw === "accept-self-signed" ? raw : "strict";
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
  const clean = raw.trim().replace(/^ftps?:\/\//i, "").replace(/\/.*$/, "");
  return clean.slice(0, 253);
}

function parsePreset(raw: unknown): StockFtpPreset | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id.trim() === "") return null;
  const protocol = normalizeProtocol(raw.protocol);
  const spec = presetFieldsOf(protocol);
  const template: StockTemplate = raw.template === "shutterstock" ? "shutterstock" : "custom";
  const name = typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name.trim().slice(0, 60) : "Stock FTP";
  return {
    id: raw.id.trim().slice(0, 48),
    name,
    template,
    protocol,
    host: normalizeHost(raw.host, template === "shutterstock" ? SHUTTERSTOCK_PRESET.host : ""),
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

function dedupePresets(list: StockFtpPreset[]): StockFtpPreset[] {
  const seen = new Set<string>();
  const out: StockFtpPreset[] = [];
  for (const item of list) {
    if (seen.has(item.id) || out.length >= MAX_STOCK_PRESETS) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.length > 0 ? out : [SHUTTERSTOCK_PRESET];
}

export function parseStockPresetState(text: string | null): StockPresetState {
  if (!text) return DEFAULT_STOCK_STATE;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== STOCK_PRESETS_VERSION || !Array.isArray(raw.presets)) return DEFAULT_STOCK_STATE;
    const presets = dedupePresets(raw.presets.flatMap((p) => parsePreset(p) ?? []));
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
  if (state.presets.length <= 1) return state;
  const presets = state.presets.filter((p) => p.id !== id);
  if (presets.length === 0) return state;
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
