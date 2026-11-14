// lookoverrides.ts — a final artboard's OWN look changes (2026-11-14). An
// artboard inherits its template's look; every look setting changed on the
// artboard is kept here (sparse: group → key → value) and wins over the
// template. Everything not changed keeps following the template live. The
// artboard's words and hero are its own anyway and are never overrides.
import { isRecord } from "../isrecord";
import { DEFAULT_CONFIG, parseSheetConfig } from "./config";
import type { SheetConfig } from "./types";

export type LookOverrides = { [G in keyof SheetConfig]?: Partial<SheetConfig[G]> };

const GROUPS = Object.keys(DEFAULT_CONFIG) as (keyof SheetConfig)[];
const OWN_WORDS = new Set(["title", "subtitle", "heroIconId"]);

const isOwnWord = (group: keyof SheetConfig, key: string) => group === "banner" && OWN_WORDS.has(key);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The keys of one group that differ from the template. */
function groupDiff<G extends keyof SheetConfig>(group: G, base: SheetConfig[G], stage: SheetConfig[G]): Partial<SheetConfig[G]> | null {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stage)) {
    if (!isOwnWord(group, key) && !same(value, (base as Record<string, unknown>)[key])) out[key] = value;
  }
  return Object.keys(out).length === 0 ? null : (out as Partial<SheetConfig[G]>);
}

/** Every look setting on the stage that differs from the template's look. */
export function overridesOf(template: { config: SheetConfig }, stage: SheetConfig): LookOverrides {
  const base = parseSheetConfig(template.config);
  const now = parseSheetConfig(stage);
  const out: Record<string, unknown> = {};
  for (const group of GROUPS) {
    const diff = groupDiff(group, base[group], now[group]);
    if (diff !== null) out[group] = diff;
  }
  return out as LookOverrides;
}

/** The template's look with the artboard's own changes on top (validated as a whole). */
export function withOverrides(base: SheetConfig, overrides: LookOverrides): SheetConfig {
  const merged: Record<string, unknown> = {};
  for (const group of GROUPS) merged[group] = { ...base[group], ...(overrides[group] ?? {}) };
  return parseSheetConfig(merged);
}

/** How many settings the artboard changed. */
export function overrideCount(overrides: LookOverrides): number {
  return GROUPS.reduce((n, g) => n + Object.keys(overrides[g] ?? {}).length, 0);
}

/** Read from storage: known groups and keys only, plain values; anything else drops. */
export function parseOverrides(raw: unknown): LookOverrides {
  if (!isRecord(raw)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const group of GROUPS) {
    const part = raw[group];
    if (!isRecord(part)) continue;
    const known = DEFAULT_CONFIG[group] as unknown as Record<string, unknown>;
    const kept = Object.fromEntries(Object.entries(part).filter(([k, v]) => k in known && !isOwnWord(group, k) && v !== undefined && typeof v !== "object"));
    if (Object.keys(kept).length > 0) out[group] = kept;
  }
  return out as LookOverrides;
}
