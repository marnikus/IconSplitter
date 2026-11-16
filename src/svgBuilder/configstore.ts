// configstore.ts — one validated localStorage owner for the builder's sheet
// configuration. No prompt, key or image bytes are ever stored here.
import { parseSheetConfig } from "../lib/svgBuilder/config";
import type { SheetConfig } from "../lib/svgBuilder/types";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_CONFIG_KEY = "iconSplitter.svgBuilder.config.v1";

export function loadSheetConfig(): SheetConfig {
  return parseSheetConfig(readObject(BUILDER_CONFIG_KEY));
}

export function saveSheetConfig(config: SheetConfig): void {
  writeKey(BUILDER_CONFIG_KEY, JSON.stringify(parseSheetConfig(config)));
}

function readObject(key: string): unknown {
  const text = readKey(key);
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
