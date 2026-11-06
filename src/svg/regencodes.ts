// regencodes.ts — the ONE reader of the current SVG code a regeneration sends
// (2026-10-20). The confirmation previews these exact texts and the queued batch
// carries them, so what the user saw is what is sent (I-76). A row whose code
// cannot be read keeps `code: null` and is named — the caller excludes it
// before anything is sent, never falls back to the main prompt.

import type { DirHandleLike } from "../lib/fs";
import { inIdOrder } from "../lib/selectionorder";
import { previewTargetOf } from "./rowmodel";
import { readSvgText } from "./svgfiles";
import type { SvgRow } from "./types";

export interface RegenCode {
  sourceId: string;
  name: string;
  /** The version the row shows (the user's choice, else the newest valid one). */
  version: number;
  svgPath: string;
  /** The code itself; null when the file is gone or unreadable. */
  code: string | null;
}

/** One row's current code; a row with no usable version answers null. */
export async function readRegenCode(root: DirHandleLike, row: SvgRow): Promise<RegenCode | null> {
  const target = previewTargetOf(row);
  if (target === null) return null;
  const code = await readSvgText(root, target.svgPath);
  return { sourceId: row.source.id, name: row.source.name, version: target.version, svgPath: target.svgPath, code };
}

/**
 * The codes of a selection, in the order the icons were picked, plus the ids
 * whose code could not be read. Nothing here throws: a failure is a named row.
 */
export async function loadRegenCodes(
  root: DirHandleLike, rows: readonly SvgRow[], ids: readonly string[],
): Promise<{ codes: Map<string, RegenCode>; missing: string[] }> {
  const picked = inIdOrder(rows, ids, (r) => r.source.id);
  const codes = new Map<string, RegenCode>();
  const missing: string[] = [];
  for (const row of picked) {
    const one = await readRegenCode(root, row);
    if (one === null || one.code === null) missing.push(row.source.id);
    else codes.set(one.sourceId, one);
  }
  return { codes, missing };
}
