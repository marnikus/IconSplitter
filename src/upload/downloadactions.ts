// downloadactions.ts — "Download all" (2026-10-08, design
// docs/archive/2026-10-08-upload-download-all/design.md): the selection's
// committed packages copied into ONE folder the user picks. The plan comes from
// the pure planner (lib/upload/download); this module owns the I/O: the
// browser's folder picker (a destination, not a root — nothing captured,
// nothing remembered), one verified write per file (read back, compared —
// RULE 23), never an overwrite, one file's failure never stopping the next
// (RULE 5), and the one honest line at the end (toast + log).

import { useCallback, useRef } from "react";
import { pickDirectory } from "../batch/picker";
import { nameExists, writeFileNew, type DirHandleLike } from "../lib/fs";
import { downloadLine, planDownload, type DownloadItem, type DownloadPlan, type DownloadResult } from "../lib/upload/download";
import { log } from "../log/logstore";
import { readBytesAt } from "./runexport";
import { downloadedSpec } from "./uploadlog";
import type { Latest } from "./types";
import type { UploadActions, UploadCtx } from "./actions";

type DownloadSlice = Pick<UploadActions, "downloadSelected">;

export function useDownloadActions(ctx: UploadCtx): DownloadSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  const downloadSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = downloadGuard(c, ids);
    if (why !== null) return c.say(why, true);
    void downloadTo(latest, ids);
  }, [latest]);
  return { downloadSelected };
}

/** The files the selection would download right now — what the button counts. */
export function downloadPlanOf(c: Pick<UploadCtx, "rows">, ids: string[]): DownloadPlan {
  const picked = new Set(ids);
  return planDownload(c.rows.filter((r) => picked.has(r.source.id)).map((r) => ({ id: r.source.id, base: r.source.base, record: r.record })));
}

function downloadGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.busy !== null) return "Wait for the current step to finish";
  return null;
}

/** Pick the folder, copy the plan, say what happened. */
async function downloadTo(latest: Latest, ids: string[]): Promise<void> {
  const c = latest.current;
  const plan = downloadPlanOf(c, ids);
  const dest = await pickDirectory();
  if (dest === null) return c.say("No folder chosen — nothing was saved");
  c.setBusy("Downloading…");
  try {
    const result = await copyPlanned(c.refs.root.current as DirHandleLike, dest, plan);
    const line = downloadLine(result, dest.name);
    log(downloadedSpec({ line, failed: result.failed }));
    latest.current.say(line, result.failed > 0);
  } finally {
    latest.current.setBusy(null);
  }
}

/** Sequential, per-file isolated: each outcome is counted, none stops the rest. */
async function copyPlanned(root: DirHandleLike, dest: DirHandleLike, plan: DownloadPlan): Promise<DownloadResult> {
  const result: DownloadResult = { saved: 0, icons: 0, kept: 0, missing: 0, failed: 0, notExported: plan.notExported };
  const savedIcons = new Set<string>();
  for (const item of plan.items) {
    const outcome = await copyOne(root, dest, item);
    result[outcome] += 1;
    if (outcome === "saved") savedIcons.add(item.id);
  }
  result.icons = savedIcons.size;
  return result;
}

/** One file: read, refuse to overwrite, write, read back and compare. */
async function copyOne(root: DirHandleLike, dest: DirHandleLike, item: DownloadItem): Promise<"saved" | "kept" | "missing" | "failed"> {
  const bytes = await readBytesAt(root, item.from);
  if (bytes === null) return "missing";
  if (await nameExists("file", dest, item.to)) return "kept";
  try {
    await writeFileNew(dest, item.to, new Blob([bytes as BlobPart]));
    const back = await readBytesAt(dest, item.to);
    if (back !== null && sameBytes(back, bytes)) return "saved";
    await dest.removeEntry?.(item.to);
    return "failed";
  } catch {
    return "failed";
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
