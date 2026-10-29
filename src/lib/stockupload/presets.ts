// presets.ts — Stock FTPS/SFTP/ESP preset definitions, protocol-varying field rules
// and validate-on-read normalization (RULE 13/20). Credentials never exist here.

import { isRecord } from "../isrecord";
import {
  DEFAULT_TIMEOUT, TIMEOUT_MAX, TIMEOUT_MIN, clampPort, clampTimeout, normalizeCertFingerprint,
  normalizeHost, normalizeProtocol, normalizeRemoteDir, normalizeTlsPolicy,
} from "./presetnorm";
import type {
  FtpProtocol, StockFormatFlags, StockFtpPreset, StockPresetState, StockTemplate, UploadFormatKey,
} from "./types";

export { DEFAULT_TIMEOUT, TIMEOUT_MAX, TIMEOUT_MIN, normalizeCertFingerprint, normalizeRemoteDir };
export const STOCK_PRESETS_VERSION = 1;
export const MAX_STOCK_PRESETS = 20;

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

export const GETTY_IMAGES_PRESET: StockFtpPreset = {
  id: "getty-images",
  name: "Getty Images",
  template: "getty-images",
  protocol: "esp-https",
  host: "api.gettyimages.com",
  port: 443,
  remoteDir: "/esp/submission/v1/submission_batches",
  passive: true,
  tlsPolicy: "strict",
  pinnedCertSha256: "",
  timeoutMs: DEFAULT_TIMEOUT,
};

export const BUILTIN_STOCK_PRESETS: readonly StockFtpPreset[] = [
  SHUTTERSTOCK_PRESET,
  ADOBE_STOCK_PRESET,
  GETTY_IMAGES_PRESET,
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

const PROTOCOL_SPECS: Record<FtpProtocol, ProtocolFieldSpec> = {
  "ftps-explicit": { usesTls: true, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: false },
  sftp: { usesTls: false, usesSshHostKey: true, defaultPort: 22, unencryptedWarning: false },
  "esp-https": { usesTls: true, usesSshHostKey: false, defaultPort: 443, unencryptedWarning: false },
  "ftps-implicit": { usesTls: true, usesSshHostKey: false, defaultPort: 990, unencryptedWarning: false },
  ftp: { usesTls: false, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: true },
};

export function presetFieldsOf(protocol: FtpProtocol): ProtocolFieldSpec {
  return PROTOCOL_SPECS[protocol];
}

function builtinForTemplate(raw: unknown, id: string): StockFtpPreset | null {
  return BUILTIN_STOCK_PRESETS.find((b) => b.template === raw || b.id === id) ?? null;
}

function resolvePresetTransport(raw: Record<string, unknown>, template: StockTemplate, builtin: StockFtpPreset | null): {
  protocol: FtpProtocol; port: number;
} {
  const defaultProto = builtin?.protocol ?? "ftps-explicit";
  const protocol: FtpProtocol = template === "adobe-stock" ? "sftp" : normalizeProtocol(raw.protocol, defaultProto);
  const spec = presetFieldsOf(protocol);
  const rawPort = template === "adobe-stock" && raw.port === 21 ? 22 : raw.port;
  return { protocol, port: clampPort(rawPort, spec.defaultPort) };
}

function resolvePresetName(rawName: unknown, builtin: StockFtpPreset | null): string {
  const fallback = builtin?.name ?? "Stock FTP";
  return typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim().slice(0, 60) : fallback;
}

function resolvePresetDir(rawDir: unknown, builtin: StockFtpPreset | null): string {
  return rawDir === undefined ? (builtin?.remoteDir ?? "/") : normalizeRemoteDir(rawDir);
}

function parsePreset(raw: unknown): StockFtpPreset | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id.trim() === "") return null;
  const id = raw.id.trim().slice(0, 48);
  const builtin = builtinForTemplate(raw.template, id);
  const template: StockTemplate = builtin?.template ?? "custom";
  const { protocol, port } = resolvePresetTransport(raw, template, builtin);
  return {
    id,
    name: resolvePresetName(raw.name, builtin),
    template,
    protocol,
    host: normalizeHost(raw.host, builtin?.host ?? ""),
    port,
    remoteDir: resolvePresetDir(raw.remoteDir, builtin),
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
  const byId = new Map<string, StockFtpPreset>();
  for (const item of list) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const out: StockFtpPreset[] = [];
  const seen = new Set<string>();
  for (const builtin of BUILTIN_STOCK_PRESETS) {
    out.push(byId.get(builtin.id) ?? builtin);
    seen.add(builtin.id);
  }
  for (const item of byId.values()) {
    if (seen.has(item.id) || out.length >= MAX_STOCK_PRESETS) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
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
