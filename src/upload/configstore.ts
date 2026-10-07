// configstore.ts — local persistence for the Gemini provider config (design
// §2.8: configurable endpoint/model/timeout/retries/concurrency, RULE 13).
// Parsing/clamping live in lib/geminiclient, so a corrupt payload costs one
// ignored load and the verified defaults. Nothing here can hold a key.

import { parseGeminiConfig, serializeGeminiConfig, type GeminiConfig } from "../lib/geminiclient";
import { readKey, writeKey } from "../state/safestorage";

const KEY = "iconSplitter.upload.gemini.v1";

export function loadGeminiConfig(): GeminiConfig {
  const text = readKey(KEY);
  if (!text) return parseGeminiConfig(null);
  try {
    return parseGeminiConfig(JSON.parse(text));
  } catch {
    return parseGeminiConfig(null);
  }
}

export function saveGeminiConfig(config: GeminiConfig): void {
  writeKey(KEY, serializeGeminiConfig(config));
}
