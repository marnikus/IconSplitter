// promptpresets.ts — the saved prompt presets, shared by every prompt window
// (2026-10-09; RULE 13). A preset is a named snapshot of a prompt's text. The
// metadata prompt (upload) and the generation prompt (Generate SVG) keep their
// own lists under their own keys, but the list rules are this one module:
// tolerant parsing, bounded count and length, and pure functions. Storage lives
// in state/presetstore.

import { isRecord } from "./isrecord";

export const PRESET_STORE_VERSION = 1;
/** Longer than any hand-written prompt, short enough to stay one request. */
export const PROMPT_MAX_CHARS = 8_000;
/** Saved prompts kept at once per list; the newest win. */
export const PRESET_LIMIT = 50;
/** A preset name has to be usable as a list entry and a sentence fragment. */
export const PRESET_NAME_MAX = 60;

export interface PromptPreset {
  name: string;
  text: string;
}

/** Stored value → presets: every entry validated, duplicates keep the last. */
export function parsePresets(raw: unknown): PromptPreset[] {
  if (!isRecord(raw) || raw.v !== PRESET_STORE_VERSION) return [];
  const list = Array.isArray(raw.presets) ? raw.presets : [];
  const kept: PromptPreset[] = [];
  for (const item of list) {
    const one = presetOf(item);
    if (one === null) continue;
    const at = kept.findIndex((p) => p.name === one.name);
    if (at >= 0) kept[at] = one;
    else kept.push(one);
  }
  return kept.slice(0, PRESET_LIMIT);
}

function presetOf(item: unknown): PromptPreset | null {
  if (!isRecord(item)) return null;
  const name = typeof item.name === "string" ? validPresetName(item.name) : null;
  if (name === null) return null;
  const text = typeof item.text === "string" ? item.text.slice(0, PROMPT_MAX_CHARS) : "";
  return { name, text };
}

export function serializePresets(presets: readonly PromptPreset[]): string {
  return JSON.stringify({ v: PRESET_STORE_VERSION, presets: presets.slice(0, PRESET_LIMIT) });
}

/** A usable name, trimmed, or null — the one rule the Save-as field obeys. */
export function validPresetName(raw: string): string | null {
  const name = raw.trim();
  if (name === "" || name.length > PRESET_NAME_MAX) return null;
  return name;
}

/** Saving a new name puts it first; saving an existing one replaces it in place. */
export function upsertPreset(presets: readonly PromptPreset[], name: string, text: string): PromptPreset[] {
  const one: PromptPreset = { name, text: text.slice(0, PROMPT_MAX_CHARS) };
  const at = presets.findIndex((p) => p.name === name);
  if (at < 0) return [one, ...presets].slice(0, PRESET_LIMIT);
  return presets.map((p, i) => (i === at ? one : p));
}

export function removePreset(presets: readonly PromptPreset[], name: string): PromptPreset[] {
  return presets.filter((p) => p.name !== name);
}

export function findPreset(presets: readonly PromptPreset[], name: string): PromptPreset | null {
  return presets.find((p) => p.name === name) ?? null;
}

export function presetNames(presets: readonly PromptPreset[]): string[] {
  return presets.map((p) => p.name);
}
