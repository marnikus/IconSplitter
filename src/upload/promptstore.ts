// promptstore.ts — local persistence for the metadata prompt and its presets
// (RULE 13). Parsing and bounds live in lib/upload/promptpresets, so a corrupt
// or hand-edited payload costs one ignored load and the documented default.
// Nothing here can hold a key: the payload is prompt text and preset names.

import {
  parsePresets, parsePromptText, serializePresets, serializePromptText, type PromptPreset,
} from "../lib/upload/promptpresets";
import { readKey, writeKey } from "../state/safestorage";

export const PROMPT_KEY = "iconSplitter.upload.prompt.v1";
export const PRESETS_KEY = "iconSplitter.upload.prompts.v1";

export function loadPrompt(): string {
  return parsePromptText(readObject(PROMPT_KEY));
}

export function savePrompt(prompt: string): void {
  writeKey(PROMPT_KEY, serializePromptText(prompt));
}

export function loadPresets(): PromptPreset[] {
  return parsePresets(readObject(PRESETS_KEY));
}

export function savePresets(presets: readonly PromptPreset[]): void {
  writeKey(PRESETS_KEY, serializePresets(presets));
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
