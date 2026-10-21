// selectedsettings.ts — one validated per-icon settings batch, one global undo entry.
// Three batches live here: a field edit (`commitBatch`, the selected-only
// dimensions), a decoration opt-in (`commitDecoration`) and the ONE reset to
// inherited (`resetBatch`). Writes a global control makes are recorded in the
// `applied` marks map, so the row and the icon's dialog read them as
// `inherited`. The reset drops the rows' LOCAL general pins only: a decoration
// (flag and geometry) always stays, so the Checked-icons boxes never untick
// and the stored defaults are never written (2026-10-21, row settings
// isolation + applied decorations + reset-to-inherited).
import {
  appliedEqual, isApplied, localResetKeys, marksOf, withApplied, withoutLocalPins, DECORATION_FIELD,
  type AppliedFields, type DecorationKey,
} from "../lib/upload/decorations";
import {
  effectiveSettings, overrideKeys, overridesEqual, type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";
import type { UploadCtx } from "./actions";

export type MakeOverride = (id: string, prior: SettingsOverrides) => SettingsOverrides | null;

type OverridesSide = Record<string, SettingsOverrides | null>;
type AppliedSide = Record<string, AppliedFields | null>;

/** One history entry's two halves, in the exact shape `uploadundo` applies. */
interface MapsPatch { ids: string[]; before: { overrides: OverridesSide; applied: AppliedSide }; after: { overrides: OverridesSide; applied: AppliedSide } }

/** Shadow, badge and size-guide numeric edits share the checked-row undo path. */
export function commitBatch(c: UploadCtx, ids: string[], label: string, make: MakeOverride): number {
  const patch = emptyPatch();
  for (const id of ids) {
    const prior = c.m.overrides[id] ?? {};
    const next = make(id, prior);
    if (next === null || overridesEqual(prior, next)) continue;
    const marks = c.m.applied[id] ?? null;
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = next;
    patch.before.applied[id] = marks;
    patch.after.applied[id] = marksAfterWrite(marks, prior, next);
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, label, patch);
}

/** A decoration opt-in for the selection: the flag plus the mark that reads as inherited. */
export function commitDecoration(
  c: UploadCtx, ids: readonly string[], spec: { key: DecorationKey; on: boolean; label: string },
): number {
  const { key, on, label } = spec;
  const field = DECORATION_FIELD[key];
  const patch = emptyPatch();
  for (const id of ids) {
    const prior = c.m.overrides[id] ?? {};
    const marks = c.m.applied[id] ?? null;
    if (effectiveSettings(c.m.defaults, prior)[field] === on) continue; // already there; keep its provenance
    const next = decoratedOverrides(prior, field, on);
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = next;
    patch.before.applied[id] = marks;
    const nextMarks = withApplied(marks, field, on);
    patch.after.applied[id] = nextMarks === null ? null : marksOf(next ?? {}, nextMarks);
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, label, patch);
}

/** On = one `true` flag; off = the key is gone ("off" is the absence of a pin). */
function decoratedOverrides(prior: SettingsOverrides, field: keyof UploadSettings, on: boolean): SettingsOverrides | null {
  if (on) return { ...prior, [field]: true };
  const { [field]: _off, ...rest } = prior;
  return Object.keys(rest).length === 0 ? null : rest;
}

/** A global write marks every field whose value it moved — inherited, never a row pin. */
function marksAfterWrite(
  marks: AppliedFields | null, prior: SettingsOverrides, next: SettingsOverrides,
): AppliedFields | null {
  let out = marks;
  for (const field of Object.keys(next) as (keyof SettingsOverrides)[]) {
    if (Object.is(prior[field], next[field])) continue;
    out = withApplied(out, field as keyof UploadSettings, true);
  }
  return out;
}

/** The checked ids a reset would really change: those that pin at least one general setting locally. */
export function resettableIds(
  ids: readonly string[], overrides: Record<string, SettingsOverrides>, applied: Record<string, AppliedFields>,
): string[] {
  return ids.filter((id) => localResetKeys(overrideKeys(overrides[id] ?? {}), applied[id]).length > 0);
}

/**
 * Reset the selection to inherited — ONE undo entry. It drops the rows' LOCAL
 * general pins; a shadow / corner badge / size guide (and every field a global
 * control applied) always stays, so the Checked-icons boxes keep their state
 * (2026-10-21, the user's correction). The stored defaults are never written.
 */
export function resetBatch(c: UploadCtx, ids: string[], label: string): number {
  const patch = emptyPatch();
  for (const id of resettableIds(ids, c.m.overrides, c.m.applied)) {
    const prior = c.m.overrides[id] ?? {};
    const marks = c.m.applied[id] ?? null;
    const kept = withoutLocalPins(prior, marks);
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = Object.keys(kept).length === 0 ? null : kept;
    patch.before.applied[id] = marks;
    patch.after.applied[id] = marksOf(kept, marks);
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, label, patch);
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

/** Exported for the tests that assert the "applied is not a pin" rule directly. */
export { isApplied, appliedEqual };
