// batchrequest.ts — the one request a batch posts (RULE 25): the prompt for
// its items (single or batch wording) over its contact sheet. Pure wiring of
// the lib builders; the attempt loop stays in runbatch.

import { batchManifest, type BatchPlan } from "../lib/svgbatch";
import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { buildChatRequest, type ChatRequest } from "../lib/svgrequest";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { BuiltComposite } from "./composite";
import type { SvgSource } from "./sources";

export interface RequestFacts {
  model: string;
  prompt: string;
  caps: ModelCaps;
  params: SamplingParams;
}

export function requestFor(facts: RequestFacts, plan: BatchPlan, items: SvgSource[], composite: BuiltComposite): ChatRequest {
  const manifest = batchManifest(plan.items);
  const prompt = items.length === 1 ? singlePrompt(facts.prompt, items[0].stem) : batchPrompt(facts.prompt, manifest);
  return buildChatRequest({ model: facts.model, prompt, image: composite.dataUrl, caps: facts.caps, params: facts.params });
}
