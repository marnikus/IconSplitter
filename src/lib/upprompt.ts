// upprompt.ts — the default Gemini metadata prompt (prompt §9, resolved
// policy: ONE rule everywhere — 40 tags, 5-7 + 3-5 title segments, 7-15 word
// description, 7 mandatory terms). The user may edit and persist the prompt;
// this module owns only the documented default text, verbatim policy included.

export const DEFAULT_META_PROMPT = `Task: Analyze the icon image to extract 3 core conceptual themes or metaphors it represents. Use these deeper abstract ideas (for example speed, growth, success, direction) rather than mere literal object descriptions, to generate structured, IP-compliant metadata.

Analysis Rule: Do not just name the object. Understand its conceptual meaning, symbolic value, and functional context.

Output Constraints & Format:
Title: Exactly 5-7 words capturing the main abstract concept or idea of the icon (derived from conceptual research, not just visual naming), followed by a period and a second phrase of exactly 3-5 words built from the two most relevant tags, in the spirit of "The Vector Icon of 'tag 1' and 'tag 2'" — the example wording is advisory; the word counts are the enforced rule.
Description: Exactly 7 to 15 words explaining the visual meaning and symbolic context.
Tags: Exactly 40 comma-separated keywords ordered from highest to lowest relevance (conceptual and visual).
Mandatory include: the 40 tags must explicitly contain these 7 terms: icon, pictogram, vector, stroke, line, editable, web.

Strict IP & Content Rules:
No Brands/Logos: exclude trademarks, company logos, and protected designs.
No Names/Characters: exclude real people, authors, and fictional characters.
No Style References: never use phrases like "in the style of" or mention artist names.
Generic Concept Only: focus purely on abstract concepts, visual symbols, and UI utility.

Output Template:
Title: [5-7 words focusing on the core abstract concept]. [3-5 words from the two most relevant tags]
Description: [7-15 words explaining visual meaning]
Tags: [40 comma-separated keywords, including the 7 required technical terms]`;

/** Stored value → prompt. Empty, missing or unusable means "use the default". */
export function parseMetaPrompt(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_META_PROMPT;
  const text = raw.trim();
  return text === "" ? DEFAULT_META_PROMPT : raw;
}

/** True when the stored prompt is the default (the UI's "reset" affordance). */
export function isDefaultMetaPrompt(prompt: string): boolean {
  return prompt.trim() === DEFAULT_META_PROMPT;
}

/** The JSON schema sent with the request so the answer is structured, not prose. */
export const META_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "tags"],
} as const;
