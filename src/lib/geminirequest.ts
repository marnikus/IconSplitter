// geminirequest.ts — the GenerateContent body (RULE 1/3/20). Owns: turning a
// prompt plus one rendered icon into the exact JSON the provider expects, and
// the schema asked for when structured output is on. The API key is never part
// of the body: it travels in the `x-goog-api-key` header, so a request cannot
// leak it into a log, a record or a preview.

import type { GeminiConfig } from "./geminiconfig";

export interface ImagePart {
  /** "image/jpeg" — what the rasteriser actually produced. */
  mimeType: string;
  /** Base64 WITHOUT the data-URL prefix. */
  base64: string;
}

export interface RequestInput {
  prompt: string;
  image: ImagePart;
  config: GeminiConfig;
}

export interface GenerateBody {
  contents: { role: string; parts: Record<string, unknown>[] }[];
  generationConfig: Record<string, unknown>;
}

/** The body for one icon: the image first, then the instructions. */
export function buildRequestBody(input: RequestInput): GenerateBody {
  return {
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } },
        { text: input.prompt },
      ],
    }],
    generationConfig: generationConfig(input.config),
  };
}

function generationConfig(config: GeminiConfig): Record<string, unknown> {
  return {
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    ...(config.structured
      ? { responseMimeType: "application/json", responseSchema: metadataSchema() }
      : {}),
  };
}

/**
 * The schema for the structured answer. Deliberately NOT a `maxItems: 40` on
 * the tags — a schema cannot express "exactly 40" and a rejected answer is worse
 * than a validated one: the 40-tag rule is enforced by `uploadmeta`, and the
 * requirement is stated in the field description so the model aims at it.
 */
export function metadataSchema(): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      title: {
        type: "STRING",
        description: "Sentence one: 5-7 words on the core abstract concept. Sentence two: 3-5 words naming the two most relevant tags.",
      },
      description: {
        type: "STRING",
        description: "7-15 words explaining the visual meaning and symbolic context.",
      },
      tags: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Exactly 40 comma-free keywords, most relevant first, including: icon, pictogram, vector, stroke, line, editable, web.",
      },
    },
    required: ["title", "description", "tags"],
  };
}

/** Bytes of the base64 image, for the request preview the user approves. */
export function imageBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/** "image/jpeg · 210 KB" — the image descriptor the preview shows. */
export function imageLabel(image: ImagePart, width: number, height: number): string {
  const kb = Math.max(1, Math.round(imageBytes(image.base64) / 1024));
  return `${image.mimeType} · ${width}×${height} · ${kb} KB`;
}
