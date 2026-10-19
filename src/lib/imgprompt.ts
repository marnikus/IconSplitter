// imgprompt.ts — AI source image generation prompt & manifest text
// (2026-10-16). Owns the default image prompt, stored-value parse/serialize
// (RULE 13), the ordered position-name manifest (same shape as SVG batch
// manifests), the single-image and contact-sheet prompt builders, and the
// three shipped starter presets. Pure: no IO, no clock.

import type { ManifestItem } from "./svgbatch";
import { type PromptPreset } from "./promptpresets";

export const DEFAULT_IMG_PROMPT =
  "Create a clean monochrome line-art icon of the same subject, pose, composition and proportions as shown. Single consistent stroke width, no fill, transparent background, high-contrast black strokes, crisp edges suitable for vector tracing.";

const ORDER_LINE =
  "Create one image for every position. Return the images in the same numeric order, starting from 1. Match the numbered manifest above.";

const ICON_NAME_LINE = (name: string) => `Icon name: ${name}`;

export function parseImgPrompt(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_IMG_PROMPT;
  const text = raw.trim();
  return text === "" ? DEFAULT_IMG_PROMPT : raw;
}

export function serializeImgPrompt(prompt: string): string {
  return JSON.stringify({ prompt });
}

export function isDefaultPrompt(prompt: string): boolean {
  return prompt.trim() === DEFAULT_IMG_PROMPT.trim();
}

export function manifestLines(items: readonly ManifestItem[]): string[] {
  return items.map((i) => `${i.position} — ${i.name}`);
}

/** Contact sheet of N images: manifest + order contract + user prompt. */
export function batchPrompt(userPrompt: string, items: readonly ManifestItem[]): string {
  const head = `Here is a batch of AI source images arranged in numbered grid order:\n${manifestLines(items).join("\n")}`;
  return `${head}\n\n${ORDER_LINE}\n\n${userPrompt.trim()}`;
}

/** One image: prompt + name line, no manifest. */
export function singlePrompt(userPrompt: string, name: string): string {
  return `${userPrompt.trim()}\n\n${ICON_NAME_LINE(name)}`;
}

export const DEFAULT_IMG_PRESETS: PromptPreset[] = [
  {
    name: "Clean line-art 2px",
    text: "Create a clean monochrome line-art icon matching the reference image exactly — same subject, pose, proportions and composition. Use a single 2 px black stroke, no fill, transparent background, rounded caps and joins, crisp edges, padding around the subject.",
  },
  {
    name: "Bold filled glyph",
    text: "Rebuild this icon as a bold solid-filled glyph: solid black shapes, no outlines, high contrast, transparent background, same subject and proportions as the reference, tight silhouette, padding around the subject.",
  },
  {
    name: "Thin outline 1.5px",
    text: "Rebuild this icon as a thin-outlined line-art version: a single 1.5 px black stroke, rounded caps and joins, no fill, transparent background, same subject, pose and proportions as the reference.",
  },
];
