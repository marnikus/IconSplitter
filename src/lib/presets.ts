// presets.ts — preset model (spec §3): every configurable value is storable.
// Owns: Preset shape, defaults, strict validation (RULE 13), list (de)serialise,
// and apply() which turns a preset into the split settings the pipeline uses.
// Pure module: storage itself lives in src/batch/store.ts.

export interface SplitSettings {
  padding: number; // percent of largest icon side, 0..25
  size: number; // output px; 0 = native
  transparent: boolean;
  mergeFrac: number | null; // null = auto merge radius
}

export type DestMode = "auto" | "custom";
export type SelectionMode = "all" | "none" | "remember";

export interface Preset {
  name: string;
  ignoreFolders: string[];
  destMode: DestMode;
  split: SplitSettings;
  selection: SelectionMode;
  useContentHash: boolean;
}

export function defaultPreset(name: string): Preset {
  return {
    name,
    ignoreFolders: ["_split_output"],
    destMode: "auto",
    split: { padding: 6, size: 0, transparent: false, mergeFrac: null },
    selection: "remember",
    useContentHash: false,
  };
}

/** Strict validator: null for junk, clamped defaults for out-of-range parts. */
export function validatePreset(x: unknown): Preset | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim() === "") return null;
  const d = defaultPreset(o.name);
  return {
    name: o.name,
    ignoreFolders: validateIgnore(o.ignoreFolders, d.ignoreFolders),
    destMode: o.destMode === "custom" ? "custom" : "auto",
    split: validateSplit(o.split),
    selection: validateSelection(o.selection),
    useContentHash: o.useContentHash === true,
  };
}

function validateIgnore(x: unknown, fallback: string[]): string[] {
  if (!Array.isArray(x)) return fallback;
  return x.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function validateSelection(x: unknown): SelectionMode {
  return x === "all" || x === "none" ? x : "remember";
}

function validateSplit(x: unknown): SplitSettings {
  const s = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
  return {
    padding: clamp(numberOr(s.padding, 6), 0, 25),
    size: validSize(numberOr(s.size, 0)),
    transparent: s.transparent === true,
    mergeFrac: validFrac(s.mergeFrac),
  };
}

function numberOr(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function validSize(v: number): number {
  const allowed = [0, 128, 256, 512, 1024, 2048];
  return allowed.includes(v) ? v : 0;
}

function validFrac(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return x >= 0 && x <= 0.15 ? x : null; // out-of-range is corrupt -> auto
}

export function serializePresetList(list: Preset[]): string {
  return JSON.stringify(list, null, 2);
}

export function parsePresetList(text: string): Preset[] {
  try {
    const x = JSON.parse(text);
    if (!Array.isArray(x)) return [];
    return x.flatMap((item) => {
      const p = validatePreset(item);
      return p ? [p] : [];
    });
  } catch {
    return [];
  }
}

/** Turns a preset into the split settings the pipeline consumes. */
export function applyPreset(p: Preset): SplitSettings {
  return { ...p.split };
}
