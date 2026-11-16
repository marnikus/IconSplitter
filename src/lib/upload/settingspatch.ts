// One immutable batch replacement for local pins or applied decoration values.
// Copying inside the loop turns Apply-as-local/reset/undo into quadratic work.
import type { SettingsOverrides } from "./settings";

export function patchSettingsMap(
  map: Record<string, SettingsOverrides>, patch: Record<string, SettingsOverrides | null> | undefined,
): Record<string, SettingsOverrides> {
  if (patch === undefined || Object.keys(patch).length === 0) return map;
  const next = { ...map };
  for (const [id, values] of Object.entries(patch)) {
    if (values === null || Object.keys(values).length === 0) delete next[id];
    else next[id] = values;
  }
  return next;
}
