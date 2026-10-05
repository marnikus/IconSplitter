// preferact.ts — choosing which version a pair previews and copies (RUN-3,
// 2026-10-05). Owns: validating the choice against the versions that really
// exist, writing it into that pair's OWN file (I-41) without touching a single
// version, patching the row from the fresh record, and publishing ONE history
// entry for the whole operation so Undo restores the previous preference.

import { useEffect, useRef } from "react";
import { withPreference, type PairMeta } from "../lib/pairmeta";
import { isUsableVersion } from "../lib/svgfile";
import { getAppState } from "../state/appstore";
import { saveMetaAt } from "../selection/pairstore";
import { bindSvgPreferApplier, type SvgPreferPatch, type SvgPreferRec } from "./preferundo";
import { metaForSource } from "./sources";
import type { DirHandleLike } from "../lib/fs";
import type { SvgRefs, SvgRow } from "./types";

/** What the preference actions need from the hook. */
export interface PreferCtx {
  rows: SvgRow[];
  refs: SvgRefs;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
  say: (msg: string, err?: boolean) => void;
  hist: { push: (entry: {
    type: string; label: string; origin: string; ids: string[];
    before: unknown; after: unknown;
  }) => void };
}

/** A mounted panel owns the apply path, so an undo uses the same file write. */
export function usePreferApplier(s: PreferCtx): void {
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => bindSvgPreferApplier((patch) => applyPreferPatch(latest.current, patch)), []);
}

/**
 * The user's choice for one source: `version` is a version that really exists
 * and produced a document, or null for "back to the newest". A choice that
 * cannot be honoured is refused with a reason — never written.
 */
export async function preferVersion(s: PreferCtx, id: string, version: number | null): Promise<void> {
  const row = s.rows.find((r) => r.source.id === id);
  if (!row) return;
  if (version !== null && !usable(row, version)) {
    return s.say("That version has no valid SVG to show", true);
  }
  const before = row.meta?.preferredVersion ?? null;
  if (before === version) return;
  const next = withPreference(metaOf(row), version);
  s.refs.metas.set(id, next);
  const root = s.refs.root.current as DirHandleLike | null;
  try {
    if (root) await saveMetaAt(root, row.source.metaPath, next);
  } catch {
    return s.say(`Could not save the preferred version for ${row.source.name}`, true);
  }
  patchRow(s, id, next);
  pushEntry(s, row, before, version);
}

/** Undo/redo entry point: set the recorded preference on every named pair. */
export async function applyPreferPatch(s: PreferCtx, patch: SvgPreferPatch): Promise<boolean> {
  const root = s.refs.root.current as DirHandleLike | null;
  let changed = false;
  for (const rec of patch.recs) {
    const row = s.rows.find((r) => r.source.id === rec.id);
    if (!row) continue;
    const next = withPreference(metaOf(row), rec.version);
    s.refs.metas.set(rec.id, next);
    if (root) await saveMetaAt(root, row.source.metaPath, next);
    patchRow(s, rec.id, next);
    changed = true;
  }
  return changed;
}

/** True when the named version exists AND produced a usable document. */
function usable(row: SvgRow, version: number): boolean {
  return (row.meta?.versions ?? []).some((v) => v.version === version && isUsableVersion(v));
}

function metaOf(row: SvgRow): PairMeta {
  return row.meta ?? metaForSource(row.source, null);
}

function patchRow(s: PreferCtx, id: string, meta: PairMeta): void {
  s.setRowsFn((rows) => rows.map((r) => (r.source.id === id ? { ...r, meta } : r)));
}

/** ONE entry per choice: Undo restores the version preferred before it. */
function pushEntry(s: PreferCtx, row: SvgRow, before: number | null, after: number | null): void {
  const label = after === null
    ? `Use the newest SVG for ${row.source.name}`
    : `Use version ${after} for ${row.source.name}`;
  s.say(label);
  s.hist.push({
    type: "svgPrefer",
    label,
    origin: getAppState().tab,
    ids: [row.source.id],
    before: { recs: [{ id: row.source.id, version: before }] },
    after: { recs: [{ id: row.source.id, version: after }] },
  });
}

export type { SvgPreferRec };
