// formatstore.ts — the builder's own persisted export-format options
// (2026-11-17): one storage key, one writer pair, validated on read by the
// shared domain parser (RULE 13) — a corrupt or hand-edited payload costs one
// ignored load and the documented defaults, never a broken export. The upload
// tab keeps its own store; both read the SAME interface (lib/exportformats).
// 2026-11-19: `useBuilderFormats` gives the dialog one live value + one write
// path, so a gesture re-renders the popup and persists in the same tick.
import { useState } from "react";
import { normalizeFormatOptions, readFormatOverrides, type ExportFormatOptions } from "../lib/exportformats";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_FORMATS_KEY = "iconSplitter.builder.formats.v1";

/**
 * The builder's documented defaults: the shared domain with the clean-up ON —
 * a stock sheet ships clean unless the user unticks it (2026-11-19). A stored
 * payload is read as OVERRIDES, so a field saved before it existed keeps this
 * default instead of "off because the key was missing".
 */
export function builderFormatDefaults(): ExportFormatOptions {
  return { ...normalizeFormatOptions(null), cleanExport: true };
}

export function loadBuilderFormats(): ExportFormatOptions {
  const defaults = builderFormatDefaults();
  const raw = readKey(BUILDER_FORMATS_KEY);
  if (raw === null) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? { ...defaults, ...readFormatOverrides(parsed as Record<string, unknown>) }
      : defaults;
  } catch {
    return defaults;
  }
}

export function saveBuilderFormats(options: ExportFormatOptions): void {
  writeKey(BUILDER_FORMATS_KEY, JSON.stringify(options));
}

/** The popup's live value and its one write path: merge, show, store (RULE 24). */
export function useBuilderFormats(): { value: ExportFormatOptions; patch: (patch: Partial<ExportFormatOptions>) => void } {
  const [value, setValue] = useState<ExportFormatOptions>(loadBuilderFormats);
  const patch = (next: Partial<ExportFormatOptions>) => setValue((current) => {
    const merged = normalizeFormatOptions({ ...current, ...next });
    saveBuilderFormats(merged);
    return merged;
  });
  return { value, patch };
}
