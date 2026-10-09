// presetstore.ts — one localStorage list of prompt presets (RULE 13). Each
// prompt window names its own key; the parsing and bounds are lib/promptpresets,
// so a corrupt payload costs one ignored load and an empty list, never a throw.

import { parsePresets, serializePresets, type PromptPreset } from "../lib/promptpresets";
import { readKey, writeKey } from "./safestorage";

export interface PresetStore {
  load: () => PromptPreset[];
  save: (presets: readonly PromptPreset[]) => void;
}

export function presetStore(key: string): PresetStore {
  return {
    load: () => parsePresets(readObject(key)),
    save: (presets) => writeKey(key, serializePresets(presets)),
  };
}

function readObject(key: string): unknown {
  const text = readKey(key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
