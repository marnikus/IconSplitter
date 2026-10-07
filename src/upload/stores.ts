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
 * Accepted metadata, cached per SOURCE FINGERPRINT (design §8): a crash never
 * repeats paid AI work, and a source change (fingerprint mismatch) simply
 * misses the cache. Entries are shape-checked on read; junk never loads.
 */
export function loadMetaCache(): Record<string, IconMetadata> {
  const raw = readObject(META_CACHE_KEY);
  if (raw === null || typeof raw.cache !== "object" || raw.cache === null) return {};
  const out: Record<string, IconMetadata> = {};
  for (const [fingerprint, value] of Object.entries(raw.cache as Record<string, unknown>)) {
    const meta = shapeOfMetadata(value);
    if (meta !== null) out[fingerprint] = meta;
  }
  return out;
}

export function saveMetaCache(cache: Record<string, IconMetadata>): void {
  writeKey(META_CACHE_KEY, JSON.stringify({ cache }));
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
