// svgprompt.ts — the generation prompt and the batch manifest text (prompt §5/§8).
// Owns: the default SVG-quality prompt, the stored-prompt parse/serialize pair
// (RULE 13), and the ordered "position — name" manifest that tells the provider
// which SVG belongs to which source image. Pure: no IO, no clock.

import type { ManifestItem } from "./svgbatch";

export const DEFAULT_SVG_PROMPT =
  "Create 4 split SVG icons. SVG connection rule: Any path endpoint intended to touch, overlap, or nearly meet another path must be snapped mathematically to that path or its anchor point. Project nearby endpoints onto the exact curve/intersection. Never leave tiny gaps, floating endpoints, overshoots, or approximate connections. Connected paths should share an exact anchor or merged geometry and remain seamless at every zoom level, but only when the connection is visually intended and does not break the image.";

/** Instruction line that fixes the response contract before the user prompt. */
const ORDER_LINE =
  "Create one SVG icon for every position. Return the SVGs in the same numeric order, starting from 1. Use the exact same name in the SVG <title>.";

/** Stored value → prompt. Empty, missing or unusable means "use the default". */
export function parsePrompt(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SVG_PROMPT;
  const text = raw.trim();
  return text === "" ? DEFAULT_SVG_PROMPT : raw;
}

export function serializePrompt(prompt: string): string {
  return JSON.stringify({ prompt });
}

export function isDefaultPrompt(prompt: string): boolean {
  return prompt.trim() === DEFAULT_SVG_PROMPT;
}

/** "1 — icon-name-one" lines in batch order (never reordered, never shifted). */
export function manifestLines(items: readonly ManifestItem[]): string[] {
  return items.map((i) => `${i.position} — ${i.name}`);
}

/**
 * The text sent with a composite image: the numbered manifest first, the
 * response contract, then the user's editable quality prompt. The manifest is
 * what makes mapping independent of appearance (prompt §5).
 */
export function batchPrompt(userPrompt: string, items: readonly ManifestItem[]): string {
  const head = `Here is a batch of icons arranged in numbered grid order:\n${manifestLines(items).join("\n")}`;
  return `${head}\n\n${ORDER_LINE}\n\n${userPrompt.trim()}`;
}

/** The text sent for a single image: no manifest, just the quality prompt. */
export function singlePrompt(userPrompt: string, name: string): string {
  return `${userPrompt.trim()}\n\nIcon name (use it as the SVG <title>): ${name}`;
}
