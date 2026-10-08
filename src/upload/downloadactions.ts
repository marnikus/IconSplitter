// downloadactions.ts — "Download all" (2026-10-08): the bulk bar's action. Guard →
// plan (pure, downloadplan.ts) → the browser's own folder dialog → read each
// committed file back from the export folder → write it with writeFileNew (it
// never overwrites, RULE 23). One log entry per icon, one toast line for the run.
// Read-only with respect to the source tree and `export/`: only the chosen folder
// receives bytes.

import { useCallback, useRef } from "react";
import { fsSupported, pickDirectory } from "../batch/picker";
import { log } from "../log/logstore";
import { listChildNames, writeFileNew, type DirHandleLike } from "../lib/fs";
import { downloadSummary, planDownload, type DownloadItem, type DownloadPlan, type DownloadSource } from "./downloadplan";
import { readBytesAt } from "./runexport";
import { downloadedSpec } from "./uploadlog";
import type { Latest, UploadRow } from "./types";
import type { Slice, UploadCtx } from "./actions";

/** Nothing is taken yet: the names that matter are decided after the dialog. */
const NO_NAMES: ReadonlySet<string> = new Set<string>();

export function useDownloadActions(ctx: UploadCtx): Slice<"downloadSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const downloadSelected = useCallback((ids: string[]) => {
    void runDownload(latest, ids);
  }, [latest]);
  return { downloadSelected };
}

/** Everything one copy-run counted, for the toast. */
interface RunCount {
  files: number;
  icons: number;
  missing: number;
  failed: number;
}

/** One icon's writes: what landed, what was missing on disk, what the browser refused. */
interface ItemCount {
  written: number;
  missing: number;
  failed: number;
}

async function runDownload(latest: Latest, ids: string[]): Promise<void> {
  const c = latest.current;
  const why = downloadGuard(c, ids);
  if (why !== null) return c.say(why, true);
  const sources = sourcesOf(c, ids);
  if (planDownload(sources, NO_NAMES).items.length === 0) {
    return c.say("None of the selected icons has an export yet — export them first", true);
  }
  // The dialog must open straight from the click: nothing awaits before it.
  const dest = await pickDirectory();
  if (dest === null) return c.say("Download cancelled — nothing was saved");
  const root = c.refs.root.current as DirHandleLike;
  const plan = planDownload(sources, new Set(await listChildNames(dest)));
  const count = await writePlan(c, root, dest, plan);
  const failing = count.missing + count.failed > 0;
  c.say(downloadSummary({
    folder: dest.name, files: count.files, icons: count.icons,
    renamed: plan.items.filter((i) => i.renamed).length,
    skipped: plan.skipped.length,
    stale: plan.items.filter((i) => i.stale).length,
    missing: count.missing, failed: count.failed,
  }), failing);
}

/** Why a copy cannot start right now, or null when it can. */
function downloadGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (!fsSupported()) return "Saving to a folder needs Chrome or Edge";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.runningMeta + c.m.runningExport > 0) return "A run is in flight — download when it has finished";
  return null;
}

/** The checked icons in list order, as the plan reads them (filters do not hide a check). */
function sourcesOf(c: UploadCtx, ids: string[]): DownloadSource[] {
  const want = new Set(ids);
  return c.rows.filter((r) => want.has(r.source.id)).map(sourceOf);
}

function sourceOf(r: UploadRow): DownloadSource {
  return {
    id: r.source.id,
    base: r.source.base,
    stale: r.stale,
    outputs: {
      svg: r.record?.outputs.svg ?? null,
      jpg: r.record?.outputs.jpg ?? null,
      eps: r.record?.outputs.eps ?? null,
    },
  };
}

/** Copies every planned item, then logs every icon — copied or skipped (D6). */
async function writePlan(c: UploadCtx, root: DirHandleLike, dest: DirHandleLike, plan: DownloadPlan): Promise<RunCount> {
  const count: RunCount = { files: 0, icons: 0, missing: 0, failed: 0 };
  for (const [i, item] of plan.items.entries()) {
    c.setBusy(`Downloading ${i + 1}/${plan.items.length}…`);
    const got = await writeItem(root, dest, item);
    count.files += got.written;
    count.missing += got.missing;
    count.failed += got.failed;
    if (got.written > 0) count.icons += 1;
    log(downloadedSpec({ id: item.id, base: item.base, written: got.written, folder: dest.name, problem: problemOf(got) }));
  }
  for (const s of plan.skipped) {
    log(downloadedSpec({ id: s.id, base: s.base, written: 0, folder: dest.name, problem: s.why }));
  }
  c.setBusy(null);
  return count;
}

/** One icon's files, one by one: a missing or refused file is counted, never fatal (RULE 5). */
async function writeItem(root: DirHandleLike, dest: DirHandleLike, item: DownloadItem): Promise<ItemCount> {
  const got: ItemCount = { written: 0, missing: 0, failed: 0 };
  for (const f of item.files) {
    const bytes = await readBytesAt(root, f.src);
    if (bytes === null) {
      got.missing += 1;
      continue;
    }
    try {
      await writeFileNew(dest, f.name, new Blob([bytes as BlobPart]));
      got.written += 1;
    } catch {
      got.failed += 1;
    }
  }
  return got;
}

/** The log's words for an icon's problems; "" when every file was written. */
function problemOf(got: ItemCount): string {
  const parts = [
    got.missing > 0 && `${got.missing} missing on disk`,
    got.failed > 0 && `${got.failed} could not be written`,
  ].filter((p): p is string => typeof p === "string");
  return parts.join(", ");
}
