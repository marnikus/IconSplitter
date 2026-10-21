// selectedsettings.ts — one validated per-icon settings batch, one global undo entry.
// Three batches live here: a field edit (`commitBatch`, the selected-only shadow
// dimensions), a decoration opt-in (`commitDecoration`, which records the
// `applied` mark that makes it read as inherited) and the ONE global reset
// (`resetBatch`), which clears the selection's pins and marks. A global control
// never writes a settings VALUE into a row — only a local edit in that row's
// own dialog pins (2026-10-21, row settings isolation + applied decorations).
import {
  appliedEqual, isApplied, localKeys, withApplied, DECORATION_FIELD,
  type AppliedDecorations, type DecorationKey,
} from "../lib/upload/decorations";
import { effectiveSettings, overrideKeys, overridesEqual, type SettingsOverrides } from "../lib/upload/settings";
import type { UploadCtx } from "./actions";

export type MakeOverride = (id: string, prior: SettingsOverrides) => SettingsOverrides | null;

type OverridesSide = Record<string, SettingsOverrides | null>;
type AppliedSide = Record<string, AppliedDecorations | null>;

/** One history entry's two halves, in the exact shape `uploadundo` applies. */
interface MapsPatch { ids: string[]; before: { overrides: OverridesSide; applied: AppliedSide }; after: { overrides: OverridesSide; applied: AppliedSide } }

/** Shadow, badge and size-guide numeric edits share the checked-row undo path. */
export function commitBatch(c: UploadCtx, ids: string[], label: string, make: MakeOverride): number {
  const patch = emptyPatch();
  for (const id of ids) {
    const prior = c.m.overrides[id] ?? {};
    const next = make(id, prior);
    if (next === null || overridesEqual(prior, next)) continue;
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = next;
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
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = decoratedOverrides(prior, field, on);
    patch.before.applied[id] = marks;
    patch.after.applied[id] = withApplied(marks, key, on);
    patch.ids.push(id);
  }
  return patch.ids.length === 0 ? 0 : pushEntry(c, label, patch);
}

/** On = one `true` flag; off = the key is gone ("off" is the absence of a pin). */
function decoratedOverrides(prior: SettingsOverrides, field: string, on: boolean): SettingsOverrides | null {
  if (on) return { ...prior, [field]: true };
  const { [field as keyof SettingsOverrides]: _off, ...rest } = prior;
  return Object.keys(rest).length === 0 ? null : rest;
}

/** The checked ids a reset would really change: a local pin or an applied decoration. */
export function resettableIds(
  ids: readonly string[], overrides: Record<string, SettingsOverrides>, applied: Record<string, AppliedDecorations>,
): string[] {
  return ids.filter((id) => {
    const marks = applied[id];
    return localKeys(overrideKeys(overrides[id] ?? {}), marks).length > 0
      || Object.keys(marks ?? {}).length > 0;
  });
}

/** Clear every local pin and applied decoration for the selection — ONE undo entry. */
export function resetBatch(c: UploadCtx, ids: string[], label: string): number {
  const patch = emptyPatch();
  for (const id of resettableIds(ids, c.m.overrides, c.m.applied)) {
    patch.before.overrides[id] = c.m.overrides[id] ?? null;
    patch.after.overrides[id] = null;
    patch.before.applied[id] = c.m.applied[id] ?? null;
    patch.after.applied[id] = null;
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
