// confirmcodes.ts — the current SVG code of the popup's selection (2026-10-20).
// The confirmation previews these EXACT texts and hands the same map to the
// queue, so the previewed prompt is the sent prompt (I-76). Reading is the one
// reader in ./regencodes: a row whose code cannot be read is named, excluded
// from the plan, and never replaced by the main prompt.

import { useEffect, useMemo, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { loadRegenCodes, type RegenCode } from "./regencodes";
import type { SvgOperation, SvgRow } from "./types";

export interface RegenCodesState {
  /** sourceId → its current code, only for the readable rows. */
  codes: Map<string, RegenCode>;
  /** sourceIds with no readable code — they never enter the plan. */
  missing: string[];
  loading: boolean;
  error: string | null;
}

const EMPTY: RegenCodesState = { codes: new Map(), missing: [], loading: false, error: null };

/** Reads the codes of a regeneration selection; a first generation reads none. */
export function useRegenCodes(
  operation: SvgOperation, rootRef: { current: DirHandleLike | null }, rows: readonly SvgRow[],
): RegenCodesState {
  const [state, setState] = useState<RegenCodesState>(EMPTY);
  const ids = useMemo(() => rows.map((r) => r.source.id), [rows]);
  useEffect(() => {
    if (operation !== "regenerate") return setState(EMPTY);
    const root = rootRef.current;
    if (root === null) return setState({ ...EMPTY, error: "Pick the source folder first" });
    let live = true;
    setState({ ...EMPTY, loading: true });
    void loadRegenCodes(root, rows, ids).then((out) => {
      if (live) setState({ codes: out.codes, missing: out.missing, loading: false, error: null });
    });
    return () => { live = false; };
  }, [operation, rootRef, rows, ids]);
  return state;
}
