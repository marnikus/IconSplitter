// configstore.ts — provider settings, persisted locally, clamped on read so a
// hostile or stale value can never break a request (RULE 13).

import { DEFAULT_CONFIG, type RequestyConfig } from "../lib/requesty";
import { readKey, writeKey } from "../state/safestorage";
import { MAX_PER_REQUEST } from "../lib/svggrid";

export const CONFIG_KEY = "iconSplitter.svggen.config.v1";

export function loadConfig(): RequestyConfig {
  const raw = readKey(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return clamp({ ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<RequestyConfig>) });
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: RequestyConfig): void {
  writeKey(CONFIG_KEY, JSON.stringify(clamp(cfg)));
}

function clamp(cfg: RequestyConfig): RequestyConfig {
  const num = (v: unknown, fb: number, lo: number, hi: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
  const str = (v: unknown, fb: string): string => (typeof v === "string" && v.length > 0 ? v : fb);
  return {
    baseUrl: str(cfg.baseUrl, DEFAULT_CONFIG.baseUrl),
    model: str(cfg.model, DEFAULT_CONFIG.model),
    timeoutMs: num(cfg.timeoutMs, DEFAULT_CONFIG.timeoutMs, 1000, 600_000),
    retries: num(cfg.retries, DEFAULT_CONFIG.retries, 0, 5),
    concurrency: num(cfg.concurrency, DEFAULT_CONFIG.concurrency, 1, 8),
    perRequest: num(cfg.perRequest, DEFAULT_CONFIG.perRequest, 1, MAX_PER_REQUEST),
  };
}
