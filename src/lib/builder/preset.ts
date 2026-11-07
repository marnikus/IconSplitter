// preset.ts — a sheet the user can come back to (design §4.5).
//
// A preset is the reproducible half of the sheet: the design, the seed, the locks
// and the slots. It is deliberately NOT the metadata, the read artwork or the
// scan — those are derived, and a preset that carried them would go stale the
// moment the library changed.
//
// Three shipped presets give a starting point; a user preset is the same shape
// with `builtin: false`. Reading is validated like every other store (RULE 13):
// junk entries are dropped, the list is capped, and a foreign version is refused
// whole rather than half-migrated.

import type { BuilderConfig } from "./defaults";
import { DEFAULT_BUILDER_CONFIG, withGrid } from "./defaults";
import { parseBuilderConfig } from "./config";
import { BUILDER_MAX_SLOTS, DEFAULT_BUILDER, type SessionBuilder } from "../session";
import { isRecord } from "../isrecord";

/** The most presets a device keeps; the oldest is dropped beyond this. */
export const BUILDER_PRESET_CAP = 20;

export interface BuilderPreset {
  name: string;
  /** The design half. */
  config: BuilderConfig;
  /** The selection half: cell-order slots, locks, seed. */
  selection: Pick<SessionBuilder, "slots" | "locked" | "seed">;
  /** Shipped presets cannot be deleted (they are the starting point, not data). */
  builtin: boolean;
}

/** The sheet a preset is taken from. */
export interface SheetLike {
  config: BuilderConfig;
  selection: Pick<SessionBuilder, "slots" | "locked" | "seed">;
}

/** Three starting points: a dense reference sheet, a roomy hero sheet, a wall. */
export const SHIPPED_PRESETS: readonly BuilderPreset[] = [
  {
    name: "Reference sheet",
    config: DEFAULT_BUILDER_CONFIG,
    selection: { slots: [], locked: [], seed: 1 },
    builtin: true,
  },
  {
    name: "Roomy 3 × 3",
    config: withGrid({ ...DEFAULT_BUILDER_CONFIG, icons: { ...DEFAULT_BUILDER_CONFIG.icons, box: 200 } }, { columns: 3, rows: 3 }),
    selection: { slots: [], locked: [], seed: 1 },
    builtin: true,
  },
  {
    name: "Dense wall 8 × 6",
    config: withGrid({ ...DEFAULT_BUILDER_CONFIG, icons: { ...DEFAULT_BUILDER_CONFIG.icons, box: 80 } }, { columns: 8, rows: 6 }),
    selection: { slots: [], locked: [], seed: 1 },
    builtin: true,
  },
];

/** The preset for a sheet, with a name the store can hold. */
export function presetFromSheet(name: string, sheet: SheetLike): BuilderPreset {
  return {
    name: presetNameOf({ name } as BuilderPreset),
    config: structuredCloneish(sheet.config),
    selection: {
      slots: [...sheet.selection.slots],
      locked: [...sheet.selection.locked],
      seed: sheet.selection.seed,
    },
    builtin: false,
  };
}

/** The showable name: trimmed, capped, never empty. */
export function presetNameOf(preset: Pick<BuilderPreset, "name">): string {
  const name = preset.name.trim().slice(0, 60);
  return name === "" ? "Untitled sheet" : name;
}

/** The text of a `.json` preset: the same shape the reader reads. */
export function presetJson(preset: BuilderPreset): string {
  return JSON.stringify({ v: 1, preset }, null, 2);
}

/** A preset file → a preset, or null when the text is not one (RULE 13). */
export function presetOfJson(text: string): BuilderPreset | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.preset)) return null;
    return toPreset(raw.preset);
  } catch {
    return null;
  }
}

/** The stored list: junk dropped, duplicates collapsed, capped. */
export function parsePresetList(raw: unknown): BuilderPreset[] {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.list)) return [];
  const byName = new Map<string, BuilderPreset>();
  for (const entry of raw.list) {
    const preset = toPreset(entry);
    if (preset === null) continue;
    // A duplicate name keeps the LAST record (the newest edit) — never a merge.
    byName.delete(preset.name);
    byName.set(preset.name, preset);
  }
  return [...byName.values()].slice(-BUILDER_PRESET_CAP);
}

/** One stored entry → a preset, or null when it carries nothing usable. */
function toPreset(raw: unknown): BuilderPreset | null {
  if (!isRecord(raw) || typeof raw.name !== "string") return null;
  const selection = toSelection(raw.selection);
  if (selection === null) return null;
  return {
    name: presetNameOf({ name: raw.name }),
    config: parseBuilderConfig(raw.config),
    selection,
    builtin: raw.builtin === true,
  };
}

/** The selection half, clamped: slots capped, locks kept to placed ids, seed positive. */
function toSelection(raw: unknown): BuilderPreset["selection"] | null {
  if (!isRecord(raw) || !Array.isArray(raw.slots)) return null;
  const slots = raw.slots.slice(0, BUILDER_MAX_SLOTS).map((id) => (typeof id === "string" && id !== "" ? id : null));
  return {
    slots,
    locked: idsOf(raw.locked).filter((id) => slots.includes(id)),
    seed: seedOf(raw.seed),
  };
}

function idsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

function seedOf(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_BUILDER.seed;
}

/**
 * What the sheet becomes when a preset is applied. `known` is the library's ids:
 * a lock the library cannot satisfy is dropped here, so a preset can never pin a
 * cell to an icon that does not exist.
 */
export function applyPreset(preset: BuilderPreset, known?: readonly string[]): SheetLike {
  // A slot naming an icon the library no longer has becomes a HOLE in place (the
  // position still means what it meant); a lock on it is dropped outright, since a
  // lock is a claim about a specific icon. Without `known` nothing is judged.
  const slots = preset.selection.slots.map((id) => (known === undefined || id === null || known.includes(id) ? id : null));
  const locked = known === undefined
    ? [...preset.selection.locked]
    : preset.selection.locked.filter((id) => known.includes(id));
  return {
    config: structuredCloneish(preset.config),
    selection: { slots, locked, seed: preset.selection.seed },
  };
}

/** A deep copy: a preset must never alias the sheet (or another preset). */
function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
