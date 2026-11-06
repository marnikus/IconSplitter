// svgedit.ts — Finish edit and its undo (2026-11-06). The path editor rewrites
// the icon file ONCE, on Finish, and records ONE "svgEdit" history entry whose
// two sides are the complete SVG text before and after the session: Undo writes
// the old text back, Redo the finished one. The session itself is gone by then,
// so a later undo never reopens anchors. The write goes to the mounted panel's
// folder (or the remembered Generate SVG folder) and every preview of that file
// reads it again. The panel lends its folder AND its history push once
// (`useSvgEditBinding`), so a row never subscribes to the history itself — a
// checkbox click must not re-render every row.

import { useEffect } from "react";
import { loadHandles } from "../batch/store";
import { probePath, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { isRecord } from "../lib/isrecord";
import { getAppState } from "../state/appstore";
import type { HistoryActions } from "../state/HistoryProvider";
import { SVG_HANDLE_KEY } from "../state/handlekeys";
import { bumpSvgFile } from "./usesvgtext";

/** One side of an edit entry: which file, and its whole text. */
export interface SvgEditSide { svgPath: string; markup: string }

interface Binding { root: () => DirHandleLike | null; push: HistoryActions["push"] }
let live: Binding | null = null;

/** A mounted Generate SVG panel lends its folder and its history push to Finish and to undo/redo. */
export function useSvgEditBinding(rootRef: { current: DirHandleLike | null }, hist: Pick<HistoryActions, "push">): void {
  const push = hist.push;
  useEffect(() => {
    const b: Binding = { root: () => rootRef.current, push };
    live = b;
    return () => { if (live === b) live = null; };
  }, [rootRef, push]);
}

/** Overwrites the SVG at `relPath` with `markup`, then refreshes its previews. */
export async function writeSvgMarkup(root: DirHandleLike, relPath: string, markup: string): Promise<void> {
  const at = relPath.lastIndexOf("/");
  const dir = await probePath(root, at < 0 ? "" : relPath.slice(0, at));
  if (dir === null) throw new Error("the SVG's folder is gone");
  await writeFileOverwrite(dir, relPath.slice(at + 1), new Blob([markup], { type: "image/svg+xml" }));
  bumpSvgFile(relPath);
}

function isSide(value: unknown): value is SvgEditSide {
  return isRecord(value) && typeof value.svgPath === "string" && value.svgPath !== "" && typeof value.markup === "string";
}

/** Undo / redo: write that side's text back. False (cursor stays) when it cannot be written. */
export async function applySvgEdit(value: unknown): Promise<boolean> {
  if (!isSide(value)) return false;
  const root = live?.root() ?? (await loadHandles(SVG_HANDLE_KEY))?.source ?? null;
  if (root === null) return false;
  try {
    await writeSvgMarkup(root, value.svgPath, value.markup);
    return true;
  } catch {
    return false;
  }
}

export interface FinishArgs {
  id: string;
  svgPath: string;
  label: string;
  before: string;
  after: string;
}

/** Finish edit: one write, one history entry; false when the file could not be written (nothing recorded). */
export async function finishSvgEdit(a: FinishArgs): Promise<boolean> {
  const b = live;
  const root = b?.root() ?? null;
  if (b === null || root === null || a.before === a.after) return false;
  try { await writeSvgMarkup(root, a.svgPath, a.after); } catch { return false; }
  b.push({
    type: "svgEdit", label: `Edit ${a.label}`, origin: getAppState().tab, ids: [a.id],
    before: { svgPath: a.svgPath, markup: a.before }, after: { svgPath: a.svgPath, markup: a.after },
  });
  return true;
}
