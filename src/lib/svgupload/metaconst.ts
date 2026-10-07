// metaconst.ts — the numbers behind the one metadata policy (design §9, C1–C3).
// They live on their own because the PROMPT, the VALIDATOR and the UI all quote
// them, and a disagreement between those three is exactly the defect the request
// names ("an example must never override formal validation"). Change a number
// here and the prompt text, the checker and the on-screen counter all follow.

import { REQUIRED_TAGS } from "./metatags";

export const TAG_COUNT = 40;
export const TITLE_WORDS = { min: 5, max: 7 } as const;
export const HOOK_WORDS = { min: 3, max: 5 } as const;
export const DESC_WORDS = { min: 7, max: 15 } as const;
export const POLICY_ID = "upload-meta-v1";

/** The seven mandatory keywords, for the prompt text and for the UI counter. */
export const REQUIRED_TAGS_TEXT = REQUIRED_TAGS.join(", ");

/** The prompt the tab sends unless the user edits it (design §9). */
export const DEFAULT_UPLOAD_PROMPT = [
  "You are naming and tagging a single vector icon for a stock marketplace listing.",
  "Look at the image, then answer with EXACTLY these three labelled blocks and nothing else:",
  "TITLE: <two sentences. First sentence: 5–7 words describing the abstract concept the icon conveys. Second sentence: 3–5 words naming the two most relevant keywords, in the pattern \"The Vector Icon of <keyword> and <keyword>\".>",
  `DESCRIPTION: <one sentence of ${DESC_WORDS.min}–${DESC_WORDS.max} words describing the icon and its best use.>`,
  `TAGS: <exactly ${TAG_COUNT} lowercase keywords, most relevant first, comma separated. All of these must appear: ${REQUIRED_TAGS_TEXT}.>`,
  "Rules: describe generic concepts only — no brand, company, product or character names, no people's names, no living artists and no \"in the style of\" phrasing.",
].join("\n");

