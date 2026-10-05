// svgpayload.ts — the ONE place a generation request and its prompt text are
// composed (feature §1). The confirmation dialog and the runner both call
// `buildPayload` with identical inputs, which is what makes "the preview equals
// the payload" true by construction instead of by imitation: there is no
// second composer that could drift. Pure: no IO, no clock (RULE 3).
//
// The composer picks the same text the runner always sent: a single-image
// request carries that image's name (and no manifest), a batch carries the
// ordered `position — name` manifest plus the response-order/naming rule.

import { batchPrompt, singlePrompt } from "./svgprompt";
import { buildChatRequest, type ChatRequest } from "./svgrequest";
import type { ManifestItem } from "./svgbatch";
import type { ModelCaps, SamplingParams } from "./modelcaps";

export interface PayloadArgs {
  model: string;
  /** The user's editable prompt, exactly as stored (never trimmed here). */
  userPrompt: string;
  /** The request's manifest in position order; one item = the single-image text. */
  manifest: readonly ManifestItem[];
  /** Data URL of the (composite) image sent with this request. */
  image: string;
  caps: ModelCaps;
  params: SamplingParams;
}

export interface SvgPayload {
  /** The final prompt text — byte for byte what the request carries. */
  prompt: string;
  request: ChatRequest;
}

/**
 * Builds the request for one plan. `prompt` is returned beside it so a surface
 * that must SHOW the text (the confirmation) and a surface that must SEND it
 * (the runner) read the same value, not two derivations of it.
 */
export function buildPayload(args: PayloadArgs): SvgPayload {
  const prompt = args.manifest.length === 1
    ? singlePrompt(args.userPrompt, args.manifest[0].name)
    : batchPrompt(args.userPrompt, args.manifest);
  return {
    prompt,
    request: buildChatRequest({
      model: args.model, prompt, image: args.image, caps: args.caps, params: args.params,
    }),
  };
}

/**
 * The wire preview, derived FROM the request itself: every field the request
 * carries gets exactly one line, and the two content parts are described by
 * size — never by bytes. A field added to the payload therefore appears in the
 * preview automatically (the anti-drift rule the test locks).
 */
export function payloadLines(request: ChatRequest): string[] {
  const lines = [`model: ${request.model}`];
  request.messages.forEach((message, mi) => {
    message.content.forEach((part, ci) => {
      lines.push(`${partName(mi, ci)}: ${partSummary(part)}`);
    });
  });
  for (const [key, value] of Object.entries(request)) {
    if (key === "model" || key === "messages") continue;
    lines.push(`${key}: ${String(value)}`);
  }
  return lines;
}

function partName(messageIndex: number, partIndex: number): string {
  return `messages[${messageIndex}].content[${partIndex}]`;
}

function partSummary(part: ChatRequest["messages"][number]["content"][number]): string {
  if (part.type === "text") return `text · ${part.text.length} chars`;
  return `image_url · ${part.image_url.url.length} chars`;
}
