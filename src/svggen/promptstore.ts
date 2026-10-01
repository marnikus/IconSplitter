// promptstore.ts — the editable generation prompt, saved locally, resettable
// to the documented default (spec §5).

import { readKey, writeKey } from "../state/safestorage";

export const PROMPT_KEY = "iconSplitter.svggen.prompt.v1";

export const DEFAULT_PROMPT = "Create 4 split SVG icons. Snap visually intended connections exactly to curves/anchors. Never leave tiny gaps, floating endpoints, overshoots, or approximate joins. Preserve seamless geometry without breaking the intended image.";

export function loadPrompt(): string {
  return readKey(PROMPT_KEY) ?? DEFAULT_PROMPT;
}

export function savePrompt(text: string): void {
  writeKey(PROMPT_KEY, text);
}

export function resetPrompt(): void {
  writeKey(PROMPT_KEY, DEFAULT_PROMPT);
}
