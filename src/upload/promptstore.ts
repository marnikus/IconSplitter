// promptstore.ts — local persistence for the metadata prompt and its presets
// (RULE 13). Parsing and bounds live in lib/upload/promptpresets and
// lib/promptpresets; the preset list is the shared presetStore. Nothing here
// can hold a key: the payload is prompt text and preset names.

import { parsePromptText, serializePromptText, type PromptPreset } from "../lib/upload/promptpresets";
import { presetStore } from "../state/presetstore";
import { readKey, writeKey } from "../state/safestorage";

export const PROMPT_KEY = "iconSplitter.upload.prompt.v1";
export const PRESETS_KEY = "iconSplitter.upload.prompts.v1";

/** The metadata prompt's own preset list (RULE 13: one key per list). */
export const uploadPresets = presetStore(PRESETS_KEY);

export function loadPrompt(): string {
  return parsePromptText(readObject(PROMPT_KEY));
}

export function savePrompt(prompt: string): void {
  writeKey(PROMPT_KEY, serializePromptText(prompt));
}

export function loadPresets(): PromptPreset[] {
  return uploadPresets.load();
}

export function savePresets(presets: readonly PromptPreset[]): void {
  uploadPresets.save(presets);
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
