// svgpayload.ts — the request the user confirms IS the request that is sent
// (confirm-preview.md C-0..C-4). Owns: turning a selection + settings into the
// exact chat request of every batch (`prepareRun`), the one image slot that is
// filled only at send time, a fingerprint of what is about to be posted, and the
// one-line description of what a request carries. Pure: no IO, no clock, no DOM
// — the dialog renders a PreparedRun and the runner posts the same object, so
// there is no second place a prompt or a body can be assembled.

import { fnv1a32 } from "./pairing";
import type { ModelCaps, SamplingParams } from "./modelcaps";
import { groupDigits } from "./modelcaps";
import { batchManifest, planBatches, type BatchPlan, type BatchSource } from "./svgbatch";
import { chatUrl, type SvgConfig } from "./svgconfig";
import { composePrompt, type PromptParts } from "./svgprompt";
import { buildChatRequest, type ChatRequest } from "./svgrequest";

/** Deliberately not a data URL: a request that leaks it is refused, not sent. */
export const IMAGE_SLOT = "image-slot:contact-sheet";

export interface PrepareArgs {
  sources: readonly BatchSource[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  /** The stored rules exactly as typed (the text sent has them trimmed). */
  rules: string;
}

export interface PreparedBatch {
  plan: BatchPlan;
  parts: PromptParts;
  /** The wire object with the image still a slot. */
  request: ChatRequest;
  fingerprint: string;
}

export interface PreparedRun {
  v: 1;
  endpoint: string;
  model: string;
  rules: string;
  batches: PreparedBatch[];
  fingerprint: string;
}

export function prepareRun(a: PrepareArgs): PreparedRun {
  const batches = planBatches(a.sources, a.config.imagesPerRequest).map((plan) => prepareBatch(plan, a));
  return {
    v: 1, endpoint: chatUrl(a.config.baseUrl), model: a.config.model, rules: a.rules,
    batches, fingerprint: hashText(batches.map((b) => b.fingerprint).join("|")),
  };
}

function prepareBatch(plan: BatchPlan, a: PrepareArgs): PreparedBatch {
  const parts = composePrompt(a.rules, batchManifest(plan.items));
  const request = buildChatRequest({
    model: a.config.model, prompt: parts.text, image: IMAGE_SLOT, caps: a.caps, params: a.params,
  });
  return { plan, parts, request, fingerprint: fingerprintOf(request) };
}

function imageUrls(r: ChatRequest): string[] {
  return r.messages.flatMap((m) => m.content.flatMap((p) => (p.type === "image_url" ? [p.image_url.url] : [])));
}

function mapImages(r: ChatRequest, to: (url: string) => string): ChatRequest {
  const content = (m: ChatRequest["messages"][number]) => m.content.map((p) =>
    (p.type === "image_url" ? { type: "image_url" as const, image_url: { ...p.image_url, url: to(p.image_url.url) } } : p));
  return { ...r, messages: r.messages.map((m) => ({ ...m, content: content(m) })) };
}

/** Fills the slot with the contact sheet. Changes the image URL and nothing else. */
export function withImage(r: ChatRequest, dataUrl: string): ChatRequest {
  const urls = imageUrls(r);
  if (urls.length !== 1 || urls[0] !== IMAGE_SLOT) throw new Error("request must hold exactly one image slot");
  return mapImages(r, () => dataUrl);
}

/** The request as shown and hashed: the image is never part of either. */
export function elideImage(r: ChatRequest): ChatRequest {
  return mapImages(r, () => IMAGE_SLOT);
}

/** Throws unless the request carries a real image — the last gate before the wire. */
export function assertSendable(r: ChatRequest): void {
  const urls = imageUrls(r);
  if (urls.length === 0 || !urls.every((u) => u.startsWith("data:image/"))) {
    throw new Error("request image must be a data:image/ URL");
  }
}

function hashText(text: string): string {
  return `${fnv1a32(text).toString(16).padStart(8, "0")}.${text.length.toString(36)}`;
}

/** 8 hex digits, a dot, the JSON length in base 36 — image elided, so preview and wire agree. */
export function fingerprintOf(r: ChatRequest): string {
  return hashText(JSON.stringify(elideImage(r)));
}

/**
 * "no temperature · 32 000 max tokens · effort high", read from the request
 * itself. `caps` only decides whether an unchosen effort is worth naming.
 */
export function describeRequest(r: ChatRequest, caps: ModelCaps): string {
  const ceiling = r.max_completion_tokens ?? r.max_tokens;
  const parts = [
    r.temperature === undefined ? "no temperature" : `temperature ${r.temperature}`,
    ceiling === undefined ? "provider-default max tokens" : `${groupDigits(ceiling)} max tokens`,
  ];
  if (caps.efforts.length > 0) parts.push(`effort ${r.reasoning_effort ?? "default"}`);
  return parts.join(" · ");
}
