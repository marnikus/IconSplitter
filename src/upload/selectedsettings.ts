// selectedsettings.ts — one validated per-icon settings batch, one global undo entry.
import { overridesEqual, type SettingsOverrides } from "../lib/upload/settings";
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
  if (changed.length === 0) return 0;
  c.dispatch({ type: "overrides-patch", overrides: after });
  c.hist.push({ type: "uploadSettings", label, origin: "upload", ids: changed,
    before: { overrides: before }, after: { overrides: after } });
  c.say(`${label} — ${changed.length} icon${changed.length === 1 ? "" : "s"}`);
  return changed.length;
}
