// promptstore.ts — local persistence for the generation prompt, its saved
// presets, and provider settings (prompt §8, RULE 13). Parsing/clamping live in
// lib/svgprompt, lib/svgconfig and lib/promptpresets, so a corrupt or hand-edited
// payload costs one ignored load and the documented defaults — never a broken
// tab. Nothing here can hold a key.

import { parseConfig, serializeConfig, type SvgConfig } from "../lib/svgconfig";
import { parsePrompt, serializePrompt } from "../lib/svgprompt";
import { presetStore } from "../state/presetstore";
import { readKey, writeKey } from "../state/safestorage";

const PROMPT_KEY = "iconSplitter.svg.prompt.v1";
const CONFIG_KEY = "iconSplitter.svg.config.v1";
/** The Generate SVG prompt presets: their own list, never the metadata one. */
export const PRESETS_KEY = "iconSplitter.svg.prompts.v1";

/** The Generate SVG prompt's own preset list (the shared presetStore). */
export const svgPresets = presetStore(PRESETS_KEY);
export const loadPresets = svgPresets.load;
export const savePresets = svgPresets.save;

export function loadPrompt(): string {
  return parsePrompt(readObject(PROMPT_KEY)?.prompt);
}

export function savePrompt(prompt: string): void {
  writeKey(PROMPT_KEY, serializePrompt(prompt));
}

export function loadConfig(): SvgConfig {
  return parseConfig(readObject(CONFIG_KEY));
}

export function saveConfig(config: SvgConfig): void {
  writeKey(CONFIG_KEY, serializeConfig(config));
}

function readObject(key: string): Record<string, unknown> | null {
  const text = readKey(key);
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
