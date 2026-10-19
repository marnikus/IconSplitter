// exportpreview.ts — the live export preview of one "SVG to upload" row
// (2026-10-19; archive/2026-10-19-upload-default-settings). A row whose
// effective settings change anything visual previews the EXACT export text
// (lib/upload/prepare), so stroke, background, artboard, ratio and padding show
// before anything is written. "As is" previews the approved source itself.
// Results are cached per (source, settings fingerprint) and each change waits a
// short debounce, so typing in STROKE never blocks the list. A stroke colour
// the background hides is said in the note (lib/upload/paintclash).

import { useEffect, useRef, useState } from "react";
import { isAsIs } from "../lib/upload/asis";
import { paintClash } from "../lib/upload/paintclash";
import { prepareExportSvg } from "../lib/upload/prepare";
import { settingsFingerprint, type UploadSettings } from "../lib/upload/settings";
import { fnv1a32 } from "../lib/pairing";

export interface ExportPreview {
  /** What the preview draws: the export text, or the source while it is built / when it failed. */
  svg: string | null;
  /** Why the export could not be previewed; null when it could. */
  note: string | null;
}

export const PREVIEW_DEBOUNCE_MS = 120;
const CACHE_MAX = 400;
const cache = new Map<string, ExportPreview>();

/** The row's preview text for these settings (debounced, cached). */
export function useExportPreview(source: string | null, settings: UploadSettings): ExportPreview {
  const key = source === null || isAsIs(settings) ? null : keyOf(source, settings);
  const [built, setBuilt] = useState<{ key: string; value: ExportPreview } | null>(null);
  const latest = useRef(settings); // a fresh object every render; the key says when it really changed
  latest.current = settings;
  useEffect(() => {
    if (key === null || source === null || cache.has(key)) return;
    const timer = setTimeout(() => setBuilt({ key, value: buildPreview(key, source, latest.current) }), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, source]);
  if (key === null) return { svg: source, note: null };
  return cache.get(key) ?? (built?.key === key ? built.value : { svg: source, note: null });
}

function keyOf(source: string, settings: UploadSettings): string {
  return `${fnv1a32(source).toString(16)}:${source.length}|${settingsFingerprint(settings)}`;
}

/** One prepare run; a failure previews the source and says why. */
function buildPreview(key: string, source: string, settings: UploadSettings): ExportPreview {
  const prepared = prepareExportSvg(source, settings);
  const value = prepared.ok ? { svg: prepared.svg, note: paintClash(settings) } : { svg: source, note: `export preview unavailable — ${prepared.detail}` };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}
