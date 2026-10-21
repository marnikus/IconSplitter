// selectedsettings.ts — one validated per-icon settings batch, one global undo entry.
// Two batches live here: a field edit (`commitBatch`, used by the shadow, badge
// and size-guide checkboxes) and the ONE global reset (`resetBatch`), which
// clears the selection's pins so those rows inherit the defaults again. A
// global control may never write a field value into a row — only a local edit
// in that row's own dialog pins (2026-10-21, row settings isolation).
import { overridesEqual, overrideKeys, type SettingsOverrides } from "../lib/upload/settings";
import type { UploadCtx } from "./actions";

export type MakeOverride = (id: string, prior: SettingsOverrides) => SettingsOverrides | null;

/** Shadow, badge and general apply share the exact same checked-row undo path. */
export function commitBatch(c: UploadCtx, ids: string[], label: string, make: MakeOverride): number {
  const before: Record<string, SettingsOverrides | null> = {};
  const after: Record<string, SettingsOverrides | null> = {};
  const changed: string[] = [];
  for (const id of ids) {
    const prior = c.m.overrides[id] ?? {};
    const next = make(id, prior);
    if (next === null || overridesEqual(prior, next)) continue;
    before[id] = c.m.overrides[id] ?? null;
    after[id] = next;
    changed.push(id);
  }
  return changed.length === 0 ? 0 : pushBatch(c, label, { changed, before, after });
}

/** The checked ids that really pin something — the reset's count and its undo subjects. */
export function overriddenIds(ids: readonly string[], overrides: Record<string, SettingsOverrides>): string[] {
  return ids.filter((id) => overrideKeys(overrides[id] ?? {}).length > 0);
}

/** Clear every pin the selection carries — ONE undo entry; 0 when nothing was pinned. */
export function resetBatch(c: UploadCtx, ids: string[], label: string): number {
  const changed = overriddenIds(ids, c.m.overrides);
  if (changed.length === 0) return 0;
  const before: Record<string, SettingsOverrides | null> = {};
  const after: Record<string, SettingsOverrides | null> = {};
  for (const id of changed) {
    before[id] = c.m.overrides[id];
    after[id] = null; // the applier's own "delete this row's pins" payload
  }
  return pushBatch(c, label, { changed, before, after });
}

/** One dispatch, one history entry, one sentence — both batches end here. */
interface Batch { changed: string[]; before: Record<string, SettingsOverrides | null>; after: Record<string, SettingsOverrides | null> }

function pushBatch(c: UploadCtx, label: string, { changed, before, after }: Batch): number {
  c.dispatch({ type: "overrides-patch", overrides: after });
  c.hist.push({ type: "uploadSettings", label, origin: "upload", ids: changed,
    before: { overrides: before }, after: { overrides: after } });
  c.say(`${label} — ${changed.length} icon${changed.length === 1 ? "" : "s"}`);
  return changed.length;
}
