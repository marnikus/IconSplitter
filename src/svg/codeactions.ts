import { reserveSources, SOURCE_BUSY } from "./jobstate";
// codeactions.ts — the code/versions/location actions of the Generate SVG tab
// (prompt §16/§18). Owns reading a version's SVG back off disk, copying the
// complete validated document, opening the code and versions dialogs, choosing
// the version for actual use/export (I-54: choice + item approval in the pair file —
// nothing is deleted), and the honest "open file location" fallback (a browser
// cannot launch Explorer, so the action copies the absolute path and says
// exactly that).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { copyFolderText } from "../lib/copypath";
import { withReview, type PairMeta } from "../lib/pairmeta";
import { withPreferred } from "../lib/pairpreferred";
import { log } from "../log/logstore";
import { saveMetaAt } from "../selection/pairstore";
import { targetPathOf, withMeta } from "./rowmodel";
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
    // The file the row names — `svg-target-{id}` shows the same path — and then
    // ITS folder (I-56). `targetPathOf` is root-relative and complete: joining
    // the row's folder onto it doubled the chain before this (the reason a deep
    // file's location came out at the wrong level).
    void copyFolderText(c.refs.root.current as DirHandleLike | null, targetPathOf(row), c.say);
  }, []);
  const readCode = useCallback((id: string, version: number) => readCodeOf(latest.current, id, version), []);
  const preferVersion = useCallback((id: string, version: number) => preferOf(latest.current, id, version), []);
  return { showCode, showHistory, copyCode, openLocation, readCode, preferVersion };
}

/**
 * Accepts the chosen SVG for actual use/export, writing choice and approval into the pair's
 * own file (I-54) — tmp, verify, overwrite, exactly like every other pair-file
 * write. Nothing on disk is removed: the history is what makes the choice
 * reversible. Returns null when it worked, else the reason, so the popup can
 * say it in place; a failure changes nothing in the row and claims nothing.
 */
async function preferOf(ctx: CodeCtx, id: string, version: number): Promise<string | null> {
  const release = reserveSources(ctx, [id]);
  if (release === null) return refuse(ctx, SOURCE_BUSY);
  try { return await savePreferredVersion(ctx, id, version); } finally { release(); }
}

async function savePreferredVersion(ctx: CodeCtx, id: string, version: number): Promise<string | null> {
  const row = ctx.rows.find((r) => r.source.id === id);
  if (!row) return refuse(ctx, "That version has no SVG to show");
  if (row.corrupt) return refuse(ctx, "This pair has no readable record file");
  const prev = ctx.refs.metas.get(id) ?? row.meta;
  if (prev === null) return refuse(ctx, "This pair has no readable record file");
  const chosen = usableVersion(prev, version);
  if (chosen === null) return refuse(ctx, "That version has no SVG to show");
  const root = ctx.refs.root.current as DirHandleLike | null;
  if (root === null) return refuse(ctx, "No folder is open — the choice cannot be saved");
  if (!await readSvgText(root, chosen.svgPath)) return refuse(ctx, "The selected SVG is missing or unreadable — nothing changed");
  const next = withReview(withPreferred(prev, version), "approved");
  try {
    await saveMetaAt(root, row.source.metaPath, next);
  } catch {
    return refuse(ctx, `The choice for ${row.source.name} could not be saved — nothing changed`);
  }
  ctx.refs.metas.set(id, next);
  ctx.setRowsFn((rows) => rows.map((r) => (r.source.id === id ? withMeta(r, next) : r)));
  log({ feature: "svg", action: "prefer-version", ids: { source: id }, detail: `accepted v${version}` });
  ctx.say(`Showing v${version} — approved for export; all ${next.versions.length} versions are still there`);
  return null;
}

/** The version the user may choose: it exists, it was generated, it is valid. */
function usableVersion(meta: PairMeta | null, version: number): SvgVersion | null {
  return (meta?.versions ?? []).find((v) => v.version === version && v.status === "generated" && v.validation.ok) ?? null;
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
