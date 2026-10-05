// svgprompt.ts — the generation prompt and the request text (prompt §5/§8).
// Owns: the default SVG-quality prompt, the stored-prompt parse/serialize pair
// (RULE 13), the ordered "position — name" manifest that tells the provider
// which SVG belongs to which source image, and the block structure of the
// request text that the confirmation displays. Pure: no IO, no clock.

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

export type BlockId = "summary" | "positions" | "protocol" | "rules" | "naming";

/** One segment of the request text. Only the rules are the user's to edit. */
export interface PromptBlock {
  id: BlockId;
  text: string;
  editable: boolean;
}

export interface PromptParts {
  kind: "batch" | "single";
  blocks: PromptBlock[];
  /** Always `joinBlocks(blocks)` — the exact text of the request. */
  text: string;
}

const SUMMARY = "Here is a batch of icons arranged in numbered grid order:";
const block = (id: BlockId, text: string, editable = false): PromptBlock => ({ id, text, editable });

function batchBlocks(rules: string, items: readonly ManifestItem[]): PromptBlock[] {
  return [
    block("summary", SUMMARY),
    block("positions", manifestLines(items).join("\n")),
    block("protocol", ORDER_LINE),
    block("rules", rules.trim(), true),
  ];
}

function singleBlocks(rules: string, name: string): PromptBlock[] {
  return [block("rules", rules.trim(), true), block("naming", `Icon name (use it as the SVG <title>): ${name}`)];
}

/** The only place separators live: one newline after the summary, a blank line elsewhere. */
export function joinBlocks(blocks: readonly PromptBlock[]): string {
  return blocks.map((b, i) => (i === 0 ? b.text : `${b.id === "positions" ? "\n" : "\n\n"}${b.text}`)).join("");
}

/**
 * The text of one request, in the blocks the confirmation shows. A batch of
 * one image uses the single template; everything else the batch template. The
 * manifest is what makes mapping independent of appearance (prompt §5).
 */
export function composePrompt(rules: string, items: readonly ManifestItem[]): PromptParts {
  const single = items.length === 1;
  const blocks = single ? singleBlocks(rules, items[0].name) : batchBlocks(rules, items);
  return { kind: single ? "single" : "batch", blocks, text: joinBlocks(blocks) };
}

/** The batch template, whatever the item count — kept for callers that name it. */
export function batchPrompt(userPrompt: string, items: readonly ManifestItem[]): string {
  return joinBlocks(batchBlocks(userPrompt, items));
}

/** The single template: no manifest, just the quality prompt and the icon name. */
export function singlePrompt(userPrompt: string, name: string): string {
  return joinBlocks(singleBlocks(userPrompt, name));
}
