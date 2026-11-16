// selectedsettings.ts — one validated per-icon settings batch, one global undo entry.
// Settings batches live here: a decoration gesture from the Export settings popup
// (`commitDecoration`, values into the `applied` map, and the selected-only
// dimensions in `commitBatch`), explicit local snapshots and Reset to inherited, which deletes
// the selection's whole override maps. A decoration is not an override, so the
// reset can clear every parameter and the decoration still applies
// (2026-10-21, archive/2026-10-21-decorations-are-not-overrides).
import {
  clearedFor, decorationsOf, rowSettings, withoutDecoration, DECORATION_FIELD,
  type DecorationKey, type DecorationValues,
} from "../lib/upload/decorations";
import {
  overrideKeys, overridesEqual, type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";
import { localSettingsSnapshot } from "../lib/upload/settingslocal";
import type { UploadCtx } from "./actions";

type OverridesSide = Record<string, SettingsOverrides | null>;
type AppliedSide = Record<string, DecorationValues | null>;

/** One history entry's two halves, in the exact shape `uploadundo` applies. */
interface MapsPatch { ids: string[]; before: { overrides: OverridesSide; applied: AppliedSide }; after: { overrides: OverridesSide; applied: AppliedSide } }

/** The decoration a popup gesture writes: on = the flag on, off = the whole group gone. */
export function commitDecoration(
  c: UploadCtx, ids: readonly string[], spec: { key: DecorationKey; on: boolean; label: string },
): number {
  const patch = emptyPatch();
  for (const id of ids) {
    const prior = c.m.overrides[id] ?? {};
    const before = decorationsOf(c.m.applied, id);
    if (rowSettings(c.m.defaults, id, c.m.overrides, c.m.applied)[DECORATION_FIELD[spec.key]] === spec.on) continue;
    patch.before.applied[id] = nullIfEmpty(before);
    patch.after.applied[id] = decorationAfter(before, spec.key, spec.on);
    // A selection-level gesture also removes that decoration's local pins, so it takes effect.
    const cleared = clearedFor(spec.key, prior);
    if (!overridesEqual(prior, cleared)) {
      patch.before.overrides[id] = c.m.overrides[id] ?? null;
      patch.after.overrides[id] = Object.keys(cleared).length === 0 ? null : cleared;
    }
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, spec.label, patch);
}

function decorationAfter(before: DecorationValues, key: DecorationKey, on: boolean): DecorationValues | null {
  const next = on ? { ...before, [DECORATION_FIELD[key]]: true } : withoutDecoration(before, key);
  return Object.keys(next).length === 0 ? null : next;
}

/** The selected-only numbers (shadow width/gap): applied values on the rows that already have it on. */
export function commitBatch(
  c: UploadCtx, ids: string[], spec: { patch: Partial<UploadSettings>; label: string },
): number {
  const fields = Object.keys(spec.patch) as (keyof UploadSettings)[];
  if (fields.length === 0) return 0;
  const patch = emptyPatch();
  for (const id of ids) {
    if (!wantsBatch(c, id, fields, spec.patch)) continue;
    const stored = c.m.overrides[id] ?? null;
    const before = decorationsOf(c.m.applied, id);
    const cleared = clearFields(stored ?? {}, fields);
    patch.before.applied[id] = nullIfEmpty(before);
    patch.after.applied[id] = { ...before, ...spec.patch };
    if (!overridesEqual(stored ?? {}, cleared)) {
      patch.before.overrides[id] = stored;
      patch.after.overrides[id] = Object.keys(cleared).length === 0 ? null : cleared;
    }
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, spec.label, patch);
}

/** A dimension never enables an icon, and a row already showing the same numbers changes nothing. */
function wantsBatch(
  c: UploadCtx, id: string, fields: readonly (keyof UploadSettings)[], next: Partial<UploadSettings>,
): boolean {
  const effective = rowSettings(c.m.defaults, id, c.m.overrides, c.m.applied);
  return effective.shadowEnabled && fields.some((field) => effective[field] !== next[field]);
}

function clearFields(overrides: SettingsOverrides, fields: readonly (keyof UploadSettings)[]): SettingsOverrides {
  const next: SettingsOverrides = { ...overrides };
  for (const field of fields) delete next[field];
  return next;
}

/** The checked ids a reset would really change: those that pin at least one parameter locally. */
export function resettableIds(
  ids: readonly string[], overrides: Record<string, SettingsOverrides>,
): string[] {
  return ids.filter((id) => overrideKeys(overrides[id] ?? {}).length > 0);
}

/**
 * "Reset to inherited": delete the selection's whole override maps — every
 * parameter reads inherited again — as ONE undo entry. Decorations live in the
 * `applied` map, so they keep applying and the Checked-icons boxes keep their
 * state; the stored global defaults are never written (2026-10-21).
 */
export function resetBatch(c: UploadCtx, ids: string[], label: string): number {
  const patch = emptyPatch();
  for (const id of resettableIds(ids, c.m.overrides)) {
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = null;
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, label, patch);
}

/** Freeze current globals on checked, loaded rows; preserve their effective decorations. */
export function commitLocalBatch(c: UploadCtx, ids: readonly string[]): number {
  const selected = new Set(c.checked);
  const loaded = new Set(c.rows.map(row => row.source.id));
  const patch = emptyPatch();
  for (const id of new Set(ids)) {
    if (!selected.has(id) || !loaded.has(id)) continue;
    const before = c.m.overrides[id] ?? null;
    const current = rowSettings(c.m.defaults, id, c.m.overrides, c.m.applied);
    const after = localSettingsSnapshot(c.m.defaults, current);
    if (overridesEqual(before ?? {}, after)) continue;
    patch.before.overrides[id] = before;
    patch.after.overrides[id] = after;
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, "Apply as local", patch);
}

/** An empty map entry is stored as null so a patch can clear it. */
function nullIfEmpty(values: DecorationValues): DecorationValues | null {
  return Object.keys(values).length === 0 ? null : values;
}

function emptyPatch(): MapsPatch {
  return { ids: [], before: { overrides: {}, applied: {} }, after: { overrides: {}, applied: {} } };
}

/** One dispatch, one history entry, one sentence — every batch ends here. */
function pushEntry(c: UploadCtx, label: string, patch: MapsPatch): number {
  c.dispatch({ type: "overrides-patch", overrides: patch.after.overrides, applied: patch.after.applied });
  c.hist.push({ type: "uploadSettings", label, origin: "upload", ids: patch.ids,
    before: patch.before, after: patch.after });
  c.say(`${label} — ${patch.ids.length} icon${patch.ids.length === 1 ? "" : "s"}`);
  return patch.ids.length;
}
