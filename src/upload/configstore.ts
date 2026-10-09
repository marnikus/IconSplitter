// configstore.ts — local persistence for the Gemini provider config (design
// §2.8: configurable endpoint/model/timeout/retries/concurrency, RULE 13).
// Parsing/clamping live in lib/upload/gemini, so a corrupt payload costs one
// ignored load and the verified defaults. Nothing here can hold a key.

import { parseGeminiConfig, serializeGeminiConfig, type GeminiConfig } from "../lib/upload/gemini";
import { parseBridgeConfig, serializeBridgeConfig, type BridgeConfig } from "../lib/upload/epsconv/bridgeconfig";
import { readKey, writeKey } from "../state/safestorage";

const KEY = "iconSplitter.upload.gemini.v1";
/** Where the Inkscape helper listens (2026-10-09) — device config, validated on read like the Gemini config. */
const BRIDGE_KEY = "iconSplitter.upload.bridge.v1";

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

export function loadBridgeConfig(): BridgeConfig {
  const text = readKey(BRIDGE_KEY);
  if (!text) return parseBridgeConfig(null);
  try {
    return parseBridgeConfig(JSON.parse(text));
  } catch {
    return parseBridgeConfig(null);
  }
}

export function saveBridgeConfig(config: BridgeConfig): void {
  writeKey(BRIDGE_KEY, serializeBridgeConfig(config));
}
