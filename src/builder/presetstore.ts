// presetstore.ts — the user's saved sheets on disk (design §4.5). One key, one
// list, validated on read and capped by lib/builder/preset. Shipped presets are
// constants, not data: they are never written here and cannot be deleted.

import {
  parsePresetList, presetNameOf, type BuilderPreset,
} from "../lib/builder/preset";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_PRESETS_KEY = "iconSplitter.builder.presets.v1";

/** The user's presets, newest last; an unreadable store is simply empty. */
export function loadUserPresets(): BuilderPreset[] {
  const text = readKey(BUILDER_PRESETS_KEY);
  if (!text) return [];
  try {
    return parsePresetList(JSON.parse(text));
  } catch {
    return [];
  }
}

/** Saves one preset by name: a same-named preset is replaced, the list is capped. */
export function saveUserPreset(preset: BuilderPreset): BuilderPreset[] {
  const named = { ...preset, name: presetNameOf(preset), builtin: false };
  const kept = loadUserPresets().filter((p) => p.name !== named.name);
  return writeList([...kept, named]);
}

/** Removes one preset by name; a shipped preset is never stored, so never removed. */
export function deleteUserPreset(name: string): BuilderPreset[] {
  return writeList(loadUserPresets().filter((p) => p.name !== name));
}

/** Writes the list (re-validated, so a bad entry cannot reach the disk). */
function writeList(list: BuilderPreset[]): BuilderPreset[] {
  const saved = parsePresetList({ v: 1, list });
  writeKey(BUILDER_PRESETS_KEY, JSON.stringify({ v: 1, list: saved }));
  return saved;
}
