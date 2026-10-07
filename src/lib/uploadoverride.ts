// uploadoverride.ts — per-icon overrides (RULE 16). Owns: the effective settings
// for one icon, the fields that differ from the global defaults, resetting an
// icon back to those defaults, and applying one change to a whole selection as a
// single reversible action.
//
// The one hard rule: an override may only hold fields a person actually changed.
// Storing the whole settings object per icon would freeze today's defaults into
// every icon, so tomorrow's default change would silently not reach them.

import { parseUploadSettings, SETTING_FIELDS, type UploadSettings } from "./uploadsettings";

export type OverridePatch = Partial<UploadSettings>;
export type OverrideMap = Record<string, OverridePatch>;

/** Global defaults first, then only the fields this icon actually overrides. */
export function effectiveSettings(global: UploadSettings, override: OverridePatch | undefined): UploadSettings {
  const merged: UploadSettings = { ...global };
  if (override === undefined) return merged;
  for (const field of SETTING_FIELDS) {
    if (override[field] !== undefined) Object.assign(merged, { [field]: override[field] });
  }
  return merged;
}

export function overriddenFields(override: OverridePatch | undefined): (keyof UploadSettings)[] {
  if (override === undefined) return [];
  return SETTING_FIELDS.filter((field) => override[field] !== undefined);
}

export function isOverridden(override: OverridePatch | undefined, field: keyof UploadSettings): boolean {
  return override !== undefined && override[field] !== undefined;
}

/** Sets one field on one icon; `undefined` in the patch means "clear this field". */
export function withOverride(map: OverrideMap, id: string, patch: OverridePatch): OverrideMap {
  const next: OverridePatch = { ...(map[id] ?? {}) };
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) delete next[field as keyof UploadSettings];
    else Object.assign(next, { [field as keyof UploadSettings]: value });
  }
  const cleaned = prune(next);
  const out: OverrideMap = { ...map };
  if (Object.keys(cleaned).length === 0) delete out[id];
  else out[id] = cleaned;
  return out;
}

/** Drops fields that equal the default, so "overridden" never lies. */
function prune(patch: OverridePatch): OverridePatch {
  const defaults = parseUploadSettings(undefined);
  const out: OverridePatch = {};
  for (const field of SETTING_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value === defaults[field]) continue;
    Object.assign(out, { [field]: value });
  }
  return out;
}

export function clearOverride(map: OverrideMap, id: string): OverrideMap {
  const out = { ...map };
  delete out[id];
  return out;
}

export interface BulkResult {
  map: OverrideMap;
  /** How many icons actually changed — the number the panel reports. */
  changed: number;
  ids: string[];
  /** The two sides of the one history entry this action produces. */
  before: OverrideMap;
  after: OverrideMap;
}

/** One undoable action: sets the same fields on every selected icon. */
export function applyToSelected(map: OverrideMap, ids: readonly string[], patch: OverridePatch): BulkResult {
  const before = pick(map, ids);
  let next = map;
  for (const id of ids) next = withOverride(next, id, patch);
  const after = pick(next, ids);
  const changed = ids.filter((id) => JSON.stringify(before[id] ?? {}) !== JSON.stringify(after[id] ?? {})).length;
  return { map: next, changed, ids: [...ids], before, after };
}

/** One undoable action: every selected icon goes back to the global defaults. */
export function resetSelected(map: OverrideMap, ids: readonly string[]): BulkResult {
  const before = pick(map, ids);
  let next = map;
  for (const id of ids) next = clearOverride(next, id);
  const after = pick(next, ids);
  const changed = ids.filter((id) => before[id] !== undefined).length;
  return { map: next, changed, ids: [...ids], before, after };
}

/** Puts a saved selection state back — the undo side of applyEntry. */
export function restoreOverrides(map: OverrideMap, ids: readonly string[], saved: OverrideMap): OverrideMap {
  let next = map;
  for (const id of ids) {
    const patch = saved[id];
    if (patch === undefined || Object.keys(patch).length === 0) next = clearOverride(next, id);
    else next = { ...next, [id]: { ...patch } };
  }
  return next;
}

function pick(map: OverrideMap, ids: readonly string[]): OverrideMap {
  const out: OverrideMap = {};
  for (const id of ids) if (map[id] !== undefined) out[id] = { ...map[id] };
  return out;
}

/** A stored override map is untrusted: each patch is re-derived from the schema. */
export function parseOverrideMap(raw: unknown): OverrideMap {
  if (typeof raw !== "object" || raw === null) return {};
  const out: OverrideMap = {};
  for (const [id, patch] of Object.entries(raw as Record<string, unknown>)) {
    if (id === "" || typeof patch !== "object" || patch === null) continue;
    const full = parseUploadSettings(patch);
    const kept: OverridePatch = {};
    const source = patch as Record<string, unknown>;
    for (const field of SETTING_FIELDS) {
      if (source[field] !== undefined) Object.assign(kept, { [field]: full[field] });
    }
    if (Object.keys(kept).length > 0) out[id] = kept;
  }
  return out;
}

export function serializeOverrideMap(map: OverrideMap): OverrideMap {
  return parseOverrideMap(map);
}

export interface InheritanceLine {
  field: keyof UploadSettings;
  value: string;
  text: string;
  /** "overridden" — this icon's own value; "inherited" — the global default. */
  source: "overridden" | "inherited";
}

/** Which settings are this icon's own and which come from the defaults. */
export function inheritance(map: OverrideMap, id: string, global: UploadSettings): InheritanceLine[] {
  const patch = map[id];
  const effective = effectiveSettings(global, patch);
  return SETTING_FIELDS.map((field) => ({
    field,
    value: String(effective[field]),
    text: `${field} ${String(effective[field])}`,
    source: isOverridden(patch, field) ? "overridden" as const : "inherited" as const,
  }));
}
