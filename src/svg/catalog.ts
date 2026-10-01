// catalog.ts — the Requesty model catalog (prompt §"read supported
// ranges/options from ... API metadata"; RULE 13/20). Owns: fetching
// GET /v1/models, reducing it to the three fields the capability rules need,
// and caching it locally so the tab opens without waiting for the network.
//
// The endpoint is public: with no Authorization header it answers 200 with
// every public model, so the app never needs the key to learn what a model
// accepts. When a key is present it is sent, which narrows the list to the
// organisation's approved models. A failure keeps the previous cache — the
// built-in family rules in lib/modelcaps are the fallback of the fallback.

import { chatModelsUrl } from "../lib/svgconfig";
import { isRecord } from "../lib/isrecord";
import { redact } from "../lib/svgsecret";
import type { CatalogModel } from "../lib/modelcaps";

const KEY = "iconSplitter.svg.modelCatalog.v1";
/** A day is long enough that a restart never refetches, short enough to notice a new model. */
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export interface CatalogCache {
  models: CatalogModel[];
  fetchedAt: number;
}

/** GET /v1/models → the rows the capability rules understand. */
export function parseCatalog(raw: unknown): CatalogModel[] {
  if (!isRecord(raw) || !Array.isArray(raw.data)) return [];
  const out: CatalogModel[] = [];
  for (const row of raw.data) {
    const model = toModel(row);
    if (model !== null) out.push(model);
  }
  return out;
}

function toModel(row: unknown): CatalogModel | null {
  if (!isRecord(row) || typeof row.id !== "string" || row.id.trim() === "") return null;
  return {
    id: row.id.trim(),
    maxOutputTokens: numOrNull(row.max_output_tokens),
    supportsReasoning: typeof row.supports_reasoning === "boolean" ? row.supports_reasoning : null,
  };
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function loadCatalog(): CatalogCache | null {
  const text = localStorage.getItem(KEY);
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || !Array.isArray(raw.models)) return null;
    const models = raw.models.map(toModel).filter((m): m is CatalogModel => m !== null);
    return { models, fetchedAt: typeof raw.fetchedAt === "number" ? raw.fetchedAt : 0 };
  } catch {
    return null;
  }
}

export function saveCatalog(models: readonly CatalogModel[]): void {
  localStorage.setItem(KEY, JSON.stringify({ v: 1, fetchedAt: Date.now(), models }));
}

export function catalogAge(cache: CatalogCache | null, now = Date.now()): number {
  return cache === null ? Number.POSITIVE_INFINITY : Math.max(0, now - cache.fetchedAt);
}

export function isStale(cache: CatalogCache | null, now = Date.now()): boolean {
  return catalogAge(cache, now) >= CATALOG_TTL_MS;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One attempt; throws a redacted, classified error when the list is unavailable. */
export async function fetchCatalog(baseUrl: string, apiKey: string | null, fetchImpl: FetchLike = fetch): Promise<CatalogModel[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey !== null && apiKey.trim() !== "") headers.Authorization = `Bearer ${apiKey.trim()}`;
  const response = await fetchImpl(chatModelsUrl(baseUrl), { method: "GET", headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(redact(`model list unavailable (HTTP ${response.status})`, apiKey ?? undefined));
  }
  return parseCatalog(parseJson(text));
}

/** Fetch, cache and return — a failure leaves the previous cache in place. */
export async function refreshCatalog(baseUrl: string, apiKey: string | null, fetchImpl: FetchLike = fetch): Promise<CatalogModel[]> {
  const models = await fetchCatalog(baseUrl, apiKey, fetchImpl);
  saveCatalog(models);
  return models;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
