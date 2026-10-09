// promptpresets.ts — the metadata prompt's text helpers (RULE 13). The preset
// list itself is shared with the Generate SVG prompt and lives in lib/promptpresets;
// it is re-exported here so the metadata callers keep one import.
//
// Honesty note that this module cannot enforce by itself and the panel says out
// loud: the metadata VALIDATOR always enforces the rules the default prompt
// states, so a prompt that asks for something else produces answers that get
// refused. Editing the prompt never relaxes the policy.

import { isRecord } from "../isrecord";
import { DEFAULT_METADATA_PROMPT } from "./meta";

export * from "../promptpresets";

export const PROMPT_STORE_VERSION = 1;

/** Stored value → prompt text. Missing, empty, junk or foreign → the default. */
export function parsePromptText(raw: unknown): string {
  if (!isRecord(raw) || raw.v !== PROMPT_STORE_VERSION) return DEFAULT_METADATA_PROMPT;
  const text = raw.prompt;
  if (typeof text !== "string") return DEFAULT_METADATA_PROMPT;
  return text.trim() === "" ? DEFAULT_METADATA_PROMPT : text;
}

export function serializePromptText(prompt: string): string {
  return JSON.stringify({ v: PROMPT_STORE_VERSION, prompt });
}

/** Would a reset change anything? True also decides the "default" label. */
export function isDefaultPrompt(prompt: string): boolean {
  return prompt.trim() === DEFAULT_METADATA_PROMPT.trim();
}
