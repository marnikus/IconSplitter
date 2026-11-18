// formatstore.ts — the builder's own persisted export-format options
// (2026-11-17): one storage key, one writer pair, validated on read by the
// shared domain parser (RULE 13) — a corrupt or hand-edited payload costs one
// ignored load and the documented defaults, never a broken export. The upload
// tab keeps its own store; both read the SAME interface (lib/exportformats).
import { normalizeFormatOptions, type ExportFormatOptions } from "../lib/exportformats";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_FORMATS_KEY = "iconSplitter.builder.formats.v1";

export function loadBuilderFormats(): ExportFormatOptions {
  const raw = readKey(BUILDER_FORMATS_KEY);
  if (raw === null) return normalizeFormatOptions(null);
  try {
    return normalizeFormatOptions(JSON.parse(raw));
  } catch {
    return normalizeFormatOptions(null);
  }
}

export function saveBuilderFormats(options: ExportFormatOptions): void {
  writeKey(BUILDER_FORMATS_KEY, JSON.stringify(options));
}
