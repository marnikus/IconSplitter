// codeactions.ts — the code/versions/location actions of the Generate SVG tab
// (prompt §16/§18). Owns reading a version's SVG back off disk, copying the
// complete validated document, opening the code and versions dialogs, choosing
// which version the row SHOWS (I-54: one additive field in the pair's own file —
// nothing is deleted), and the honest "open file location" fallback (a browser
// cannot launch Explorer, so the action copies the absolute path and says
// exactly that).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { copyFolderText } from "../lib/copypath";
import { withPreferred } from "../lib/pairpreferred";
import { log } from "../log/logstore";
import { saveMetaAt } from "../selection/pairstore";
import { previewTargetOf, withMeta } from "./rowmodel";
import { readSvgText } from "./svgfiles";
import type { SvgAction, SvgModel } from "./statemodel";
import type { Dispatch } from "react";
import type { SvgActions } from "./actions";
import type { SvgVersion } from "../lib/svgmodel";
import type { SvgRefs, SvgRow } from "./types";

/** Only what these actions need: the dialog writer and the rows to read. */
export interface CodeCtx {
  m: SvgModel;
  dispatch: Dispatch<SvgAction>;
  refs: SvgRefs;
  rows: SvgRow[];
  say: (msg: string, err?: boolean) => void;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
}

type Slice<K extends keyof SvgActions> = Pick<SvgActions, K>;

export function useCodeActions(ctx: CodeCtx): Slice<"showCode" | "showHistory" | "copyCode" | "openLocation" | "readCode" | "preferVersion"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const showCode = useCallback((id: string, version: number) => {
    latest.current.dispatch({ type: "dialog", dialog: { kind: "code", id, version } });
  }, []);
  const showHistory = useCallback((id: string) => {
    latest.current.dispatch({ type: "dialog", dialog: { kind: "history", id } });
  }, []);
  const copyCode = useCallback((id: string, version: number) => {
    void copyOf(latest.current, id, version);
  }, []);
  const openLocation = useCallback((id: string) => {
    const c = latest.current;
    const row = c.rows.find((r) => r.source.id === id);
    if (!row) return;
    const target = previewTargetOf(row)?.svgPath ?? row.source.metaPath;
    void copyFolderText(c.m.rootName, target, c.say);
  }, []);
  const readCode = useCallback((id: string, version: number) => readCodeOf(latest.current, id, version), []);
  const preferVersion = useCallback((id: string, version: number) => preferOf(latest.current, id, version), []);
  return { showCode, showHistory, copyCode, openLocation, readCode, preferVersion };
}

/**
 * Chooses which version the row shows, and writes that choice into the pair's
 * own file (I-54) — tmp, verify, overwrite, exactly like every other pair-file
 * write. Nothing on disk is removed: the history is what makes the choice
 * reversible. Returns null when it worked, else the reason, so the popup can
 * say it in place; a failure changes nothing in the row and claims nothing.
 */
async function preferOf(ctx: CodeCtx, id: string, version: number): Promise<string | null> {
  const row = ctx.rows.find((r) => r.source.id === id);
  const chosen = usableVersion(row, version);
  if (!row || chosen === null) return refuse(ctx, "That version has no SVG to show");
  if (row.meta === null) return refuse(ctx, "This pair has no record file yet");
  const root = ctx.refs.root.current as DirHandleLike | null;
  if (root === null) return refuse(ctx, "No folder is open — the choice cannot be saved");
  const next = withPreferred(row.meta, version);
  try {
    await saveMetaAt(root, row.source.metaPath, next);
  } catch {
    return refuse(ctx, `The choice for ${row.source.name} could not be saved — nothing changed`);
  }
  ctx.refs.metas.set(id, next);
  ctx.setRowsFn((rows) => rows.map((r) => (r.source.id === id ? withMeta(r, next) : r)));
  log({ feature: "svg", action: "prefer-version", ids: { source: id }, detail: `showing v${version}` });
  ctx.say(`Showing v${version} — all ${next.versions.length} versions are still there`);
  return null;
}

/** The version the user may choose: it exists, it was generated, it is valid. */
function usableVersion(row: SvgRow | undefined, version: number): SvgVersion | null {
  return (row?.meta?.versions ?? []).find((v) => v.version === version && v.status === "generated" && v.validation.ok) ?? null;
}

function refuse(ctx: CodeCtx, message: string): string {
  ctx.say(message, true);
  return message;
}

/** Reads the validated SVG document a version points at. */
async function readCodeOf(ctx: CodeCtx, id: string, version: number): Promise<string | null> {
  const root = ctx.refs.root.current as DirHandleLike | null;
  const row = ctx.rows.find((r) => r.source.id === id);
  const found = (row?.meta?.versions ?? []).find((v) => v.version === version && v.status === "generated");
  if (!root || !found || found.svgPath === "") return null;
  return readSvgText(root, found.svgPath);
}

/** Copies the complete validated SVG and says whether that worked. */
async function copyOf(ctx: CodeCtx, id: string, version: number): Promise<void> {
  const code = await readCodeOf(ctx, id, version);
  if (!code) return ctx.say("No validated SVG to copy yet", true);
  try {
    await navigator.clipboard.writeText(code);
    ctx.say("SVG code copied");
  } catch {
    ctx.say("Clipboard is blocked — open Code and copy manually", true);
  }
}
