// promptstore.ts — the builder's own sheet-metadata prompt and preset list.
// The Gemini key is NOT here: it stays in the shared IndexedDB key vault.
import { isRecord } from "../lib/isrecord";
import { DEFAULT_SHEET_PROMPT, isDefaultSheetPrompt } from "../lib/svgBuilder/metadata";
import { presetStore } from "../state/presetstore";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_PROMPT_KEY = "iconSplitter.svgBuilder.prompt.v1";
export const BUILDER_PRESETS_KEY = "iconSplitter.svgBuilder.prompts.v1";
const PROMPT_VERSION = 1;

export const builderPresets = presetStore(BUILDER_PRESETS_KEY);

export function loadBuilderPrompt(): string {
  return parseBuilderPrompt(readObject(BUILDER_PROMPT_KEY));
}

export function saveBuilderPrompt(prompt: string): void {
  writeKey(BUILDER_PROMPT_KEY, JSON.stringify({ v: PROMPT_VERSION, prompt }));
}

export function parseBuilderPrompt(raw: unknown): string {
  if (!isRecord(raw) || raw.v !== PROMPT_VERSION || typeof raw.prompt !== "string") return DEFAULT_SHEET_PROMPT;
  return raw.prompt.trim() === "" ? DEFAULT_SHEET_PROMPT : raw.prompt;
}

export function isBuilderDefaultPrompt(prompt: string): boolean {
  return isDefaultSheetPrompt(prompt);
}

function readObject(key: string): unknown {
  const text = readKey(key);
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
