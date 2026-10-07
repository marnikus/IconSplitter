// uploadprompt.ts — the prompt contract (RULE 9). Owns: the default metadata
// prompt, the JSON contract appended when structured output is requested, and
// the exact-request preview the user reads before a paid call.
//
// The preview cannot leak the credential: the API key is not a parameter of any
// function here, so it can never reach a preview, a log line or a saved record.

import { DESCRIPTION_WORDS, REQUIRED_TAGS, SUBTITLE_WORDS, TAG_COUNT, TITLE_WORDS } from "./uploadmeta";

export const DEFAULT_METADATA_PROMPT = [
  "Task: analyze the icon image and describe its core conceptual themes or metaphors",
  "(abstract ideas such as speed, growth, progress or direction, not just the object shown).",
  "",
  "Rules",
  `- Title: sentence one states the main concept in ${TITLE_WORDS[0]} to ${TITLE_WORDS[1]} words; sentence two names the two most`,
  `  relevant tags in ${SUBTITLE_WORDS[0]} to ${SUBTITLE_WORDS[1]} words. The word counts are what is checked — phrasing may vary,`,
  '  for example "The Vector Icon of growth and speed".',
  `- Description: ${DESCRIPTION_WORDS[0]} to ${DESCRIPTION_WORDS[1]} words explaining the visual meaning and its symbolic context.`,
  `- Tags: Exactly ${TAG_COUNT} comma-separated keywords, ordered from the most to the least relevant.`,
  `- The ${TAG_COUNT} tags must include these terms: ${REQUIRED_TAGS.join(", ")}.`,
  "- Strict IP rules: no brands, logos or trademarks; no real people or fictional characters;",
  '  no style references such as "in the style of" or artist names; generic concepts only.',
  "- The reply is a draft for human review; it does not grant or imply legal clearance.",
  "",
  "Answer with these three labelled lines and nothing else:",
  "Title: <sentence one> <sentence two>",
  "Description: <the description>",
  `Tags: <the ${TAG_COUNT} keywords>`,
].join("\n");

/** Appended when the request asks for a JSON response. */
export const JSON_CONTRACT = [
  "",
  "Reply with one JSON object and nothing else:",
  '{"title": string, "description": string, "tags": string[]}',
  `"tags" must have exactly ${TAG_COUNT} entries.`,
].join("\n");

/** A stored prompt is untrusted input; an unusable one falls back to the default. */
export function parseMetadataPrompt(raw: unknown): string {
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return DEFAULT_METADATA_PROMPT;
}

export function isDefaultMetadataPrompt(prompt: string): boolean {
  return prompt.trim() === DEFAULT_METADATA_PROMPT.trim();
}

/** The text actually sent: the editable prompt, plus the JSON contract if asked. */
export function finalPrompt(userPrompt: string, structured: boolean): string {
  const base = userPrompt.trim() === "" ? DEFAULT_METADATA_PROMPT : userPrompt.trim();
  return structured ? `${base}\n${JSON_CONTRACT}` : base;
}

export function promptChars(prompt: string, structured: boolean): number {
  return finalPrompt(prompt, structured).length;
}

export interface PreviewInput {
  prompt: string;
  model: string;
  endpoint: string;
  /** Human label for the rendered icon — the preview shows its size, not pixels. */
  image: string;
  structured: boolean;
  temperature: number;
}

/**
 * The exact request the Generate button will send. It is built from the same
 * values the client uses (`generateContentUrl`, the model id, the final prompt),
 * minus the credential, which this module never receives.
 */
export function requestPreview(input: PreviewInput): string {
  return [
    `POST ${input.endpoint}`,
    `model: ${input.model}`,
    `image: ${input.image}`,
    `response: ${input.structured ? "structured JSON (responseMimeType=application/json)" : "text"}`,
    `temperature: ${input.temperature}`,
    "prompt:",
    finalPrompt(input.prompt, input.structured),
  ].join("\n");
}
