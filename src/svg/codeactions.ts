// codeactions.ts — the code/history/location actions of the Generate SVG tab
// (prompt §16/§18). Owns reading a version's SVG back off disk, copying the
// complete validated document, opening the code and history dialogs, and the
// honest "open file location" fallback (a browser cannot launch Explorer, so
// the action copies the absolute path and says exactly that).

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { copyPathText } from "../selection/copypath";
import { previewTargetOf } from "./rowmodel";
import { readSvgText } from "./sidecar";
import type { SvgAction, SvgModel } from "./statemodel";
import type { Dispatch } from "react";
import type { SvgActions } from "./actions";
import type { SvgRefs, SvgRow } from "./types";

/** Only what these actions need: the dialog writer and the rows to read. */
export interface CodeCtx {
  m: SvgModel;
  dispatch: Dispatch<SvgAction>;
  refs: SvgRefs;
  rows: SvgRow[];
  say: (msg: string, err?: boolean) => void;
}

type Slice<K extends keyof SvgActions> = Pick<SvgActions, K>;

export function useCodeActions(ctx: CodeCtx): Slice<"showCode" | "showHistory" | "copyCode" | "openLocation" | "readCode"> {
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
    const target = previewTargetOf(row)?.svgPath ?? `${row.source.stem}.svg.json`;
    void copyPathText(c.m.rootName, joinPath(row.source.dirPath, target), c.say);
  }, []);
  const readCode = useCallback((id: string, version: number) => readCodeOf(latest.current, id, version), []);
  return { showCode, showHistory, copyCode, openLocation, readCode };
}

/** Reads the validated SVG document a version points at. */
async function readCodeOf(ctx: CodeCtx, id: string, version: number): Promise<string | null> {
  const root = ctx.refs.root.current as DirHandleLike | null;
  const row = ctx.rows.find((r) => r.source.id === id);
  const found = (row?.sidecar?.versions ?? []).find((v) => v.version === version && v.status === "generated");
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

function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}
