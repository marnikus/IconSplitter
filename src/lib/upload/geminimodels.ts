// geminimodels.ts — the provider's own model list (CP-8, merge-report §9): one
// GET that answers "does this model exist?" with the provider's words. The
// configured model is NEVER substituted from the answer — the card reports
// found/missing and a human decides. Same auth header and same bounded request
// window as every other call this client makes.

import { isRecord } from "../isrecord";
import { parseJson, readRetryAfterMs } from "../svgrequest";
import {
  AUTH_HEADER, boundedRequest, type FetchLike, type GeminiConfig,
} from "./gemini";
import { classifyGeminiHttp, classifyGeminiTransport, type GeminiFailure } from "./geminifail";

// --- the provider's own model list (CP-8) ------------------------------------

/** Where the provider lists its models. The key travels in the header, not here. */
export function listModelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

/** `{ models: [{ name: "models/gemini-…" }] }` → bare ids; junk entries dropped. */
export function readGeminiModelIds(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.models)) return [];
  const ids: string[] = [];
  for (const item of raw.models) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name === "") continue;
    ids.push(item.name.replace(/^models\//, ""));
  }
  return ids;
}

export type GeminiModelsOut =
  | { ok: true; ids: string[]; status: number }
  | { ok: false; failure: GeminiFailure };

/**
 * Asks the provider which models exist. The configured model is NEVER
 * substituted from the answer: the caller reports found/missing and a human
 * decides. One GET, the same timeout and auth header as a paid request.
 */
export async function listGeminiModels(args: {
  config: GeminiConfig; apiKey: string; fetch?: FetchLike; signal?: AbortSignal;
}): Promise<GeminiModelsOut> {
  const { config, apiKey } = args;
  const bound = boundedRequest(config.timeoutMs, args.signal);
  try {
    const response = await (args.fetch ?? fetch)(listModelsUrl(config.baseUrl), {
      method: "GET",
      headers: { [AUTH_HEADER]: apiKey.trim() },
      signal: bound.signal,
    });
    const body = parseJson(await response.text());
    if (!response.ok) {
      return { ok: false, failure: classifyGeminiHttp(response.status, body, readRetryAfterMs(response.headers)) };
    }
    return { ok: true, ids: readGeminiModelIds(body), status: response.status };
  } catch (error) {
    const cancelled = args.signal?.aborted === true;
    return { ok: false, failure: classifyGeminiTransport(error, { cancelled, timedOut: bound.timedOut() }) };
  } finally {
    bound.done();
  }
}
