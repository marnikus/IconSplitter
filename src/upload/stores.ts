// stores.ts — local persistence for the SVG-to-upload tab (design §5/§7/§8).
// Owns: the localStorage keys (defaults, per-icon overrides, prompt, Gemini
// config, accepted-metadata cache) with tolerant reads — a corrupt or
// hand-edited payload costs one ignored load and the documented defaults,
// never a broken tab (RULE 13). Parsing and clamping live in the lib modules;
// this file only moves text. Nothing here can hold an API key.

import { readKey, writeKey } from "../state/safestorage";
import {
  sanitizeExportSettings, sanitizeOverride, type ExportOverride, type ExportSettings,
} from "../lib/upsettings";
import { parseMetaPrompt } from "../lib/upprompt";
import { parseGeminiConfig, serializeGeminiConfig, type GeminiConfig } from "../lib/gemconfig";
import type { IconMetadata } from "../lib/upmeta";
import type { MetadataProvenance } from "../lib/upexport";

const DEFAULTS_KEY = "iconSplitter.upload.defaults.v1";
const OVERRIDES_KEY = "iconSplitter.upload.overrides.v1";
const PROMPT_KEY = "iconSplitter.upload.prompt.v1";
const META_CACHE_KEY = "iconSplitter.upload.meta.v1";

export function loadUploadDefaults(): ExportSettings {
  return sanitizeExportSettings(readObject(DEFAULTS_KEY)?.settings);
}

export function saveUploadDefaults(settings: ExportSettings): void {
  writeKey(DEFAULTS_KEY, JSON.stringify({ settings }));
}

/** pairId → sanitized override; junk values are dropped, not trusted. */
export function loadUploadOverrides(): Record<string, ExportOverride | null> {
  const raw = readObject(OVERRIDES_KEY);
  if (raw === null || typeof raw.overrides !== "object" || raw.overrides === null) return {};
  const out: Record<string, ExportOverride | null> = {};
  for (const [id, value] of Object.entries(raw.overrides as Record<string, unknown>)) {
    const clean = sanitizeOverride(value);
    if (clean !== null) out[id] = clean;
  }
  return out;
}

export function saveUploadOverrides(overrides: Record<string, ExportOverride | null>): void {
  writeKey(OVERRIDES_KEY, JSON.stringify({ overrides }));
}

export function loadMetaPrompt(): string {
  const raw = readObject(PROMPT_KEY);
  return parseMetaPrompt(raw?.prompt);
}

export function saveMetaPrompt(prompt: string): void {
  writeKey(PROMPT_KEY, JSON.stringify({ prompt }));
}

/** The Gemini provider config, clamped on read (parse lives in lib/gemconfig). */
export function loadGeminiConfig(): GeminiConfig {
  return parseGeminiConfig(readObject("iconSplitter.upload.gemini.v1"));
}

export function saveGeminiConfig(config: GeminiConfig): void {
  writeKey("iconSplitter.upload.gemini.v1", serializeGeminiConfig(config));
}

/**
 * Accepted metadata, cached per SOURCE IDENTITY (design §8 / R03): the key is
 * the source's content hash when the scan could read it, and only falls back
 * to the size:mtime stat. An in-place edit with the same size and mtime is
 * therefore a different icon, and a crash never repeats paid AI work for the
 * same bytes. Entries are shape-checked on read; junk never loads.
 */
export interface MetaEntry {
  meta: IconMetadata;
  /** Where the answer came from; null for an entry written before R10. */
  provenance: MetadataProvenance | null;
}

export function loadMetaCache(): Record<string, MetaEntry> {
  const raw = readObject(META_CACHE_KEY);
  if (raw === null || typeof raw.cache !== "object" || raw.cache === null) return {};
  const out: Record<string, MetaEntry> = {};
  for (const [key, value] of Object.entries(raw.cache as Record<string, unknown>)) {
    const entry = shapeOfEntry(value);
    if (entry !== null) out[key] = entry;
  }
  return out;
}

export function saveMetaCache(cache: Record<string, MetaEntry>): void {
  writeKey(META_CACHE_KEY, JSON.stringify({ cache }));
}

/** Bare metadata (the older shape) reads as an entry whose origin is unknown. */
function shapeOfEntry(value: unknown): MetaEntry | null {
  const bare = shapeOfMetadata(value);
  if (bare !== null) return { meta: bare, provenance: null };
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const meta = shapeOfMetadata(v.meta);
  if (meta === null) return null;
  return { meta, provenance: shapeOfProvenance(v.provenance) };
}

function shapeOfProvenance(value: unknown): MetadataProvenance | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const origin = v.origin;
  if (origin !== "user" && origin !== "ai") return null;
  const prompt = textOrNull(v.prompt);
  const generatedAt = textOrNull(v.generatedAt);
  const policy = textOrNull(v.policy);
  if (prompt === null || generatedAt === null || policy === null) return null;
  return {
    origin, prompt, generatedAt, policy,
    model: textOrNull(v.model) ?? "",
    endpointHost: textOrNull(v.endpointHost) ?? "",
    requestId: textOrNull(v.requestId),
    inputTokens: numberOrNull(v.inputTokens),
    outputTokens: numberOrNull(v.outputTokens),
    estimatedCostUsd: numberOrNull(v.estimatedCostUsd),
  };
}

/** Shape helpers for the optional provenance fields — one rule each. */
function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** The row fields the metadata question reads; structural, so no import cycle. */
export interface MetaSubject {
  metadata: IconMetadata | null;
  source: {
    contentSha: string | null;
    svgFingerprint: string | null;
    recovery: { draft: IconMetadata | null; provenance: MetadataProvenance | null } | null;
  };
}

/** The cache identity: the content hash first, the stat only as a fallback. */
export function metaKeyOf(source: MetaSubject["source"]): string | null {
  return source.contentSha ?? source.svgFingerprint;
}

/**
 * Metadata already in hand, in the order that never pays twice: what the user
 * accepted in this session, the cached answer for these exact bytes, then the
 * durable draft an interrupted run left behind (R03/R10).
 */
export function knownMeta(row: MetaSubject): IconMetadata | null {
  return entryFor(row)?.meta ?? null;
}

/** Where the metadata in hand came from — a recovered AI answer stays AI. */
export function knownProvenance(row: MetaSubject): MetadataProvenance | null {
  if (row.metadata !== null) return null; // provided by the caller, with its own provenance
  return entryFor(row)?.provenance ?? null;
}

function entryFor(row: MetaSubject): MetaEntry | null {
  const key = metaKeyOf(row.source);
  const cached = key === null ? null : loadMetaCache()[key] ?? null;
  if (cached !== null) return cached;
  const draft = row.source.recovery;
  return draft === null || draft.draft === null ? null : { meta: draft.draft, provenance: draft.provenance };
}

/** Remembers an accepted answer under the content identity of its source. */
export function rememberMeta(source: MetaSubject["source"], meta: IconMetadata, provenance: MetadataProvenance): void {
  const key = metaKeyOf(source);
  if (key === null) return;
  saveMetaCache({ ...loadMetaCache(), [key]: { meta, provenance } });
}

function shapeOfMetadata(value: unknown): IconMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || typeof v.description !== "string") return null;
  if (!Array.isArray(v.tags) || !v.tags.every((t) => typeof t === "string")) return null;
  return { title: v.title, description: v.description, tags: v.tags };
}

function readObject(key: string): Record<string, unknown> | null {
  const text = readKey(key);
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
