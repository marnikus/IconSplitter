// answerer.ts — who answers a run's requests, and what that means for the
// rest of the run (2026-11-03). The ONE place that tells the provider API from
// the web chat, so the runner, the request and the saved records never test
// for the transport themselves:
//   - how many icons one request carries,
//   - how a reply's SVG blocks map back to icons,
//   - the provider and model every version, outcome and journal entry records.

import { matchBlocks, matchLoneBlock } from "../lib/svgextract";
import { requestSizeFor } from "../lib/svgregen";
import type { RunArgs } from "./runtypes";

type Answering = Pick<RunArgs, "web" | "config" | "regen">;

/** The API carries the configured size; a chat turn is one picture and one prompt. */
export function requestSizeOf(args: Answering): number {
  return args.web ? 1 : requestSizeFor(args.config.imagesPerRequest, args.regen);
}

/** A chat reply is "only SVG code" for its one icon: nothing in it names the icon. */
export function replyMatcherOf(args: Pick<RunArgs, "web">): typeof matchBlocks {
  return args.web ? matchLoneBlock : matchBlocks;
}

export function providerOf(args: Pick<RunArgs, "web">): string {
  return args.web ? args.web.provider() : "Requesty";
}

/** What really answered — never the configured API model when the chat did. */
export function modelOf(args: Pick<RunArgs, "web" | "config">): string {
  return args.web ? args.web.model : args.config.model;
}
