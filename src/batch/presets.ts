// presets.ts owns batch presets: schema, validation, localStorage (RULE 13).

// Same domain values as SIZES in src/App.tsx (output square px). Duplicated
// deliberately: App.tsx is a legacy hotspot (RULE 16.5) — sharing one const
// would mean touching it. Keep the two lists in sync by hand.
export const BATCH_SIZES = [0, 128, 256, 512, 1024, 2048];

export interface ScanRules {
  includeExtensions: string[];
  ignoreOutputDir: boolean;
  useContentHash: boolean;
}

export interface SplitSettings {
  padding: number;
  size: number;
  transparent: boolean;
  mergeFrac: number | null;
}

export interface NamingRules {
  outputDirName: string;
  monthFormat: "YYYY-MM";
  batchFormat: "YYYY-MM-DD_HH-mm-ss";
  splitPrefix: "split_";
  splitExt: "png";
}

export interface SelectionPrefs {
  autoSelectNew: boolean;
  keepMissingInList: boolean;
}

export interface DuplicateRules {
  neverOverwrite: boolean;
  variationPrefix: string;
}

export interface BatchSettings {
  scan: ScanRules;
  split: SplitSettings;
  naming: NamingRules;
  selection: SelectionPrefs;
  duplicates: DuplicateRules;
}

export interface FolderMeta {
  sourceName: string;
  destName: string;
  useCustomDest: boolean;
}

export interface BatchPreset extends BatchSettings, FolderMeta {
  version: 1;
  name: string;
  updatedAt: string;
}

export function defaultPreset(name: string, now: string): BatchPreset {
  return {
    version: 1,
    name,
    sourceName: "",
    destName: "",
    useCustomDest: false,
    scan: { includeExtensions: ["png", "jpg", "jpeg", "webp"], ignoreOutputDir: true, useContentHash: false },
    split: { padding: 6, size: 512, transparent: false, mergeFrac: null },
    naming: { outputDirName: "_split_output", monthFormat: "YYYY-MM", batchFormat: "YYYY-MM-DD_HH-mm-ss", splitPrefix: "split_", splitExt: "png" },
    selection: { autoSelectNew: true, keepMissingInList: true },
    duplicates: { neverOverwrite: true, variationPrefix: "_v" },
    updatedAt: now,
  };
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isExt(e: unknown): e is string {
  return typeof e === "string" && /^[a-z0-9]{1,5}$/.test(e);
}

function sanScan(v: unknown): ScanRules | null {
  if (!isRec(v) || !Array.isArray(v.includeExtensions)) return null;
  const exts = v.includeExtensions.filter(isExt);
  if (!exts.length || exts.length !== v.includeExtensions.length) return null;
  if (typeof v.ignoreOutputDir !== "boolean" || typeof v.useContentHash !== "boolean") return null;
  return { includeExtensions: exts, ignoreOutputDir: v.ignoreOutputDir, useContentHash: v.useContentHash };
}

function isPaddingPct(v: unknown): v is number {
  return typeof v === "number" && v >= 0 && v <= 25;
}

function isMergeFrac(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && v >= 0 && v <= 0.15);
}

function sanSplit(v: unknown): SplitSettings | null {
  if (!isRec(v)) return null;
  if (!isPaddingPct(v.padding)) return null;
  if (typeof v.size !== "number" || !BATCH_SIZES.includes(v.size)) return null;
  if (typeof v.transparent !== "boolean") return null;
  if (!isMergeFrac(v.mergeFrac)) return null;
  return { padding: v.padding, size: v.size, transparent: v.transparent, mergeFrac: v.mergeFrac };
}

export function isOutputDirName(v: unknown): v is string {
  return typeof v === "string" && /^[^/\\]{1,64}$/.test(v) && v !== "." && v !== "..";
}

function sanNaming(v: unknown): NamingRules | null {
  if (!isRec(v)) return null;
  if (!isOutputDirName(v.outputDirName)) return null;
  if (v.monthFormat !== "YYYY-MM" || v.batchFormat !== "YYYY-MM-DD_HH-mm-ss" || v.splitPrefix !== "split_" || v.splitExt !== "png") return null;
  return { outputDirName: v.outputDirName, monthFormat: "YYYY-MM", batchFormat: "YYYY-MM-DD_HH-mm-ss", splitPrefix: "split_", splitExt: "png" };
}

function sanSelection(v: unknown): SelectionPrefs | null {
  if (!isRec(v)) return null;
  if (typeof v.autoSelectNew !== "boolean" || typeof v.keepMissingInList !== "boolean") return null;
  return { autoSelectNew: v.autoSelectNew, keepMissingInList: v.keepMissingInList };
}

export function isVariationPrefix(v: unknown): v is string {
  return typeof v === "string" && /^_[^/\\]{0,7}$/.test(v);
}

function sanDuplicates(v: unknown): DuplicateRules | null {
  if (!isRec(v)) return null;
  if (v.neverOverwrite !== true || !isVariationPrefix(v.variationPrefix)) return null;
  return { neverOverwrite: true, variationPrefix: v.variationPrefix };
}

interface PresetMeta extends FolderMeta {
  name: string;
  updatedAt: string;
}

function sanMeta(v: Record<string, unknown>): PresetMeta | null {
  if (v.version !== 1 || typeof v.name !== "string" || !v.name.trim()) return null;
  if (typeof v.sourceName !== "string" || typeof v.destName !== "string" || typeof v.useCustomDest !== "boolean") return null;
  if (typeof v.updatedAt !== "string" || Number.isNaN(Date.parse(v.updatedAt))) return null;
  return { name: v.name, sourceName: v.sourceName, destName: v.destName, useCustomDest: v.useCustomDest, updatedAt: v.updatedAt };
}

export function sanitizePreset(raw: unknown): BatchPreset | null {
  if (!isRec(raw)) return null;
  const meta = sanMeta(raw);
  const scan = sanScan(raw.scan);
  const split = sanSplit(raw.split);
  const naming = sanNaming(raw.naming);
  const selection = sanSelection(raw.selection);
  const duplicates = sanDuplicates(raw.duplicates);
  if (!meta || !scan || !split || !naming || !selection || !duplicates) return null;
  return { version: 1, ...meta, scan, split, naming, selection, duplicates };
}

export function normalizeExtensions(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.toLowerCase().split(/[\s,;]+/)) {
    const e = part.startsWith(".") ? part.slice(1) : part;
    if (/^[a-z0-9]{1,5}$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

export function settingsOf(p: BatchPreset): BatchSettings {
  return { scan: p.scan, split: p.split, naming: p.naming, selection: p.selection, duplicates: p.duplicates };
}

export function presetFrom(name: string, folders: FolderMeta, settings: BatchSettings, now: string): BatchPreset {
  return { version: 1, name, ...folders, ...settings, updatedAt: now };
}

const PRESETS_KEY = "iconsplitter.presets.v1";
const LAST_KEY = "iconsplitter.preset.last.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readDict(): Record<string, unknown> {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(PRESETS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRec(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function listPresetNames(): string[] {
  const dict = readDict();
  return Object.keys(dict)
    .filter((k) => sanitizePreset(dict[k]) !== null)
    .sort();
}

export function readPreset(name: string): BatchPreset | null {
  return sanitizePreset(readDict()[name]);
}

export function writePreset(p: BatchPreset): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const dict = readDict();
    dict[p.name] = p;
    s.setItem(PRESETS_KEY, JSON.stringify(dict));
  } catch {
    return false;
  }
  writeLastName(p.name);
  return true;
}

export function removePreset(name: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const dict = readDict();
    delete dict[name];
    s.setItem(PRESETS_KEY, JSON.stringify(dict));
    if (s.getItem(LAST_KEY) === name) s.removeItem(LAST_KEY);
  } catch {
    return false;
  }
  return true;
}

export function readLastName(): string | null {
  try {
    return storage()?.getItem(LAST_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastName(name: string): boolean {
  try {
    storage()?.setItem(LAST_KEY, name);
    return true;
  } catch {
    return false;
  }
}
