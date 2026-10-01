// processFlow.ts owns batch execution: rescan-before-process,
// missing-reference gating, progress, abort, report toasts.

import { ensureDir, loadImageFromFile, type FsDirHandle } from "../../batch/fs";
import { stemOf } from "../../batch/naming";
import { messageOf, processBatch, type BatchReport, type ProcessItem } from "../../batch/process";
import { selectedItems, type BatchItem } from "../../batch/reducer";
import { refInfoOf, runScan, type FlowCtx, type ScanApplied } from "./scanFlow";

function readyToProcess(ctx: FlowCtx): boolean {
  if (!ctx.snap.folders.source) {
    ctx.say("Choose a source folder first", true);
    return false;
  }
  if (!selectedItems(ctx.snap).length) {
    ctx.say("Nothing selected to process", true);
    return false;
  }
  return true;
}

function withoutMissing(items: BatchItem[], allow: boolean | null): BatchItem[] | null {
  const missing = items.filter((i) => !i.referenceFound);
  if (missing.length && allow === null) return null;
  return allow === false ? items.filter((i) => i.referenceFound) : items;
}

function toProcessItem(i: BatchItem): ProcessItem {
  const source = i.source;
  if (!source) throw new Error(`Cannot process a file that is no longer there: ${i.relPath}`);
  return { relPath: i.relPath, dir: i.dir, name: i.name, stem: stemOf(i.name), handle: source.handle, refName: i.referenceName, refFound: i.referenceFound, refHandle: i.ref?.handle ?? null };
}

async function resolveOutputRoot(ctx: FlowCtx): Promise<FsDirHandle | null> {
  const folders = ctx.snap.folders;
  if (folders.useCustomDest) {
    if (!folders.dest) {
      ctx.say("Choose a destination folder or turn off custom destination", true);
      return null;
    }
    return folders.dest;
  }
  const src = folders.source;
  if (!src) {
    ctx.say("Choose a source folder first", true);
    return null;
  }
  try {
    return await ensureDir(src, ctx.snap.settings.naming.outputDirName);
  } catch (e) {
    ctx.say(`Could not create output folder: ${messageOf(e)}`, true);
    return null;
  }
}

function reportSummary(r: BatchReport): string {
  const bits = [`${r.processed} processed, ${r.icons} icons`];
  if (r.skipped.length) bits.push(`${r.skipped.length} skipped`);
  if (r.failed.length) bits.push(`${r.failed.length} failed`);
  if (r.interrupted) bits.push("interrupted");
  return `Batch ${r.batchPath}: ${bits.join(", ")}`;
}

async function executeBatch(ctx: FlowCtx, fresh: ScanApplied, final: BatchItem[], outputRoot: FsDirHandle): Promise<void> {
  const report = await processBatch({
    dirs: fresh.dirs,
    outputRoot,
    items: final.map(toProcessItem),
    tracked: fresh.tracked,
    refs: refInfoOf(final),
    settings: ctx.snap.settings,
    now: new Date(),
    decode: loadImageFromFile,
    onProgress: (d, t, label) => ctx.setBusy(`Processing ${d}/${t} — ${label}`),
    shouldAbort: () => ctx.abort.current,
  });
  for (const o of report.outcomes) ctx.dispatch({ type: "item-patched", relPath: o.relPath, patch: { state: o.state, note: o.note, size: o.size, mtime: o.mtime } });
  ctx.say(reportSummary(report), report.failed.length > 0 || report.interrupted);
}

export async function runProcess(ctx: FlowCtx, allowMissingRef: boolean | null): Promise<void> {
  if (!readyToProcess(ctx)) return;
  const fresh = await runScan(ctx);
  if (!fresh) return;
  const items = fresh.items.filter((i) => fresh.selected.includes(i.relPath));
  if (!items.length) {
    ctx.say("Rescan removed every selected file (all missing)", true);
    return;
  }
  const gated = withoutMissing(items, allowMissingRef);
  if (!gated) {
    ctx.onMissingRefs(items.filter((i) => !i.referenceFound));
    return;
  }
  if (!gated.length) {
    ctx.say("All selected items were skipped (missing reference)", true);
    return;
  }
  const outputRoot = await resolveOutputRoot(ctx);
  if (!outputRoot) return;
  ctx.abort.current = false;
  ctx.setBusy(`Processing 0/${gated.length}…`);
  try {
    await executeBatch(ctx, fresh, gated, outputRoot);
  } catch (e) {
    ctx.say(`Processing failed: ${messageOf(e)}`, true);
  } finally {
    ctx.setBusy(null);
  }
}
