// configstore.ts — the sheet design on disk (design §4.5). One key, one shape,
// validated on read like every other store (RULE 13): a corrupt or foreign
// payload costs one ignored load and the verified defaults, never a broken tab.
//
// The session slice already carries the config so a reload restores the sheet
// exactly; this key is what makes the design survive even when the session was
// reset (and it is what an older session falls back to).

import { parseBuilderConfig, serializeBuilderConfig } from "../lib/builder/config";
import type { BuilderConfig } from "../lib/builder/defaults";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_CONFIG_KEY = "iconSplitter.builder.config.v1";

/** The stored sheet design, or the verified default. */
export function loadBuilderConfig(): BuilderConfig {
  const text = readKey(BUILDER_CONFIG_KEY);
  if (!text) return parseBuilderConfig(null);
  try {
    return parseBuilderConfig(JSON.parse(text));
  } catch {
    return parseBuilderConfig(null);
  }
}

/** Writes the design; the reader clamps it again on the way back. */
export function saveBuilderConfig(config: BuilderConfig): void {
  writeKey(BUILDER_CONFIG_KEY, serializeBuilderConfig(config));
}
