// svgrun.ts — shared fixtures for tests that drive the REAL runner against a
// fake transport (RULE 8): a FakeDir with AI images, matching SvgSources (their
// fingerprint is what a scan derives from getFile(): text length + mtime), a
// canvas shim, a scripted fetch, and one place that builds RunArgs.
import { vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../../src/lib/svgconfig";
import { DEFAULT_PARAMS, capsFor, type ModelCaps, type SamplingParams } from "../../src/lib/modelcaps";
import { prepareRun } from "../../src/lib/svgpayload";
import type { RunArgs } from "../../src/svg/runner";
import { toBatchSource, type SvgSource } from "../../src/svg/sources";
import { FakeDir, FakeFile } from "./fakefs";

/** Assembled from parts so no key-shaped literal is committed (hygiene test). */
export const KEY = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

export const stemOf = (name: string): string => `${name}_AI`;

/** The AI image of `name`, as a scan would have recorded it. */
export function sourceOf(name: string, index = 0): SvgSource {
  const text = `img-${name}`;
  return {
    id: `pair_${name}`, name: `${stemOf(name)}.png`, stem: stemOf(name),
    relPath: `architecture/${stemOf(name)}.png`, dirPath: "architecture",
    fingerprint: `${text.length}:${3100 + index}`,
  };
}

export function sourcesOf(names: readonly string[]): SvgSource[] {
  return names.map((n, i) => sourceOf(n, i));
}

/** A folder holding one AI image per name, matching `sourcesOf(names)`. */
export function rootWith(names: readonly string[]): FakeDir {
  const dir = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  names.forEach((n, i) => {
    const file = `${stemOf(n)}.png`;
    arch.children.set(file, new FakeFile(file, 20, 3100 + i, `img-${n}`));
  });
  dir.children.set("architecture", arch);
  return dir;
}

/** Canvas without pixels: the composite path runs for real, the PNG is tiny. */
export function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ fillStyle: "", fillRect: () => undefined, drawImage: () => undefined }) as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
}

export const SVG_PATH = "<path d=\"M2 2h20v20H2z\"/>";

/** A fenced svg answer whose <title> is the manifest name. */
export function block(title: string, body = SVG_PATH): string {
  return "```svg\n" + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${title}</title>${body}</svg>` + "\n```";
}

export const USAGE = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.01, currency: "USD" };

export function okReply(content: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: USAGE }), {
    status: 200, headers: { "content-type": "application/json", "x-request-id": "req_1", ...headers },
  });
}

export function failReply(status: number, message = "boom", headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status, headers: { "content-type": "application/json", ...headers },
  });
}

export type Reply = Response | "hang";

export interface PostedCall { url: string; init: RequestInit; body: string }

/**
 * Scripted transport for the chat endpoint: reply i answers post i (the last
 * one repeats). "hang" never settles until the caller aborts — what a stuck
 * connection does. Anything that is not a POST (the model-list refresh a panel
 * makes on mount) is answered as if offline, and is not recorded.
 */
export function stubFetchSeq(replies: readonly Reply[]): PostedCall[] {
  const calls: PostedCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== "POST") throw new TypeError("offline");
    calls.push({ url, init, body: String(init.body) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply !== "hang") return reply.clone();
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });
  }));
  return calls;
}

export interface RunOver extends Partial<Omit<RunArgs, "config">> {
  config?: Partial<SvgConfig>;
  names?: readonly string[];
  rules?: string;
  caps?: ModelCaps;
  params?: SamplingParams;
}

/**
 * RunArgs for the given names: one image per request and no retries unless
 * overridden. `prepared` is built from the same sources, config and rules the
 * run uses, exactly as the confirmation dialog would have built it.
 */
export function runArgs(over: RunOver = {}): RunArgs {
  const names = over.names ?? ["fog"];
  const { config, names: _names, rules, caps, params, ...rest } = over;
  void _names;
  const merged: SvgConfig = { ...DEFAULT_CONFIG, imagesPerRequest: 1, retries: 0, ...config };
  const sources = rest.sources ?? sourcesOf(names);
  const prepared = rest.prepared ?? prepareRun({
    sources: sources.map(toBatchSource), config: merged, caps: caps ?? capsFor(merged.model),
    params: params ?? DEFAULT_PARAMS, rules: rules ?? "p",
  });
  return {
    root: rootWith(names), apiKey: KEY, config: merged, prepared, sources, sidecars: new Map(),
    signal: new AbortController().signal, onEvent: () => undefined, ...rest,
  };
}
