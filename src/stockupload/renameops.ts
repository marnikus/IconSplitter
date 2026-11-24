// renameops.ts — per-item and bulk upload file renaming on the "Upload"
// (stockUpload) tab. Renames exported files in `export/` atomically, updates
// `export.json` (`workName` + `uploadName` + `outputs.*.path`), syncs
// `uploadnamestore`, rescans while preserving `item.id` and `workName`, and
// publishes live ProcessProgressBar + per-item feedback.

import { useCallback, useRef } from "react";
import type { ExportedItem } from "../lib/stockupload/types";
import { stemOf } from "../lib/upload/export";
import { buildUploadName, sanitizeUploadName } from "../lib/upload/uploadname";
import { renameExportPackage, type RenameExportResult } from "../upload/renameexport";
import { announceItemRename, singleRenameMessage } from "../upload/renamefeedback";
import {
  announceBatchRename,
  beginRenameRun,
  yieldRenameProgress,
  type RenameItemOutcome,
} from "../upload/renameprogress";
import { setUploadName } from "../upload/uploadnamestore";
import type { StockModelAction, StockRefs, StockUploadModel } from "./model";

export interface StockRenameOps {
  renameItem: (id: string, nextUploadName: string | null) => void;
  renameSelected: () => void;
}

interface RenameDeps {
  model: StockUploadModel;
  items: ExportedItem[];
  checked: string[];
  r: StockRefs;
  dispatch: (a: StockModelAction) => void;
  say: (msg: string, err?: boolean) => void;
  runScan: (audible?: boolean) => void;
}

export function itemWorkName(item: ExportedItem): string {
  if (item.workName && item.workName !== "") return item.workName;
  if (item.record.workName && item.record.workName !== "") return item.record.workName;
  if (item.record.pair.base !== "") return stemOf(item.record.pair.base);
  return item.stem;
}

function desiredStem(rawName: string | null): string | null {
  return rawName === null ? null : (sanitizeUploadName(rawName) || null);
}

function classifyStockOutcome(diskRenamed: boolean, unchanged: boolean): RenameItemOutcome {
  if (diskRenamed) return { kind: "disk" };
  return unchanged ? { kind: "unchanged" } : { kind: "pending" };
}

function isSameStockStem(diskRenamed: boolean, alreadyNamed: boolean | undefined, prev: string, next: string): boolean {
  return !diskRenamed && (alreadyNamed === true || prev === next);
}

function finalizeStockRename(
  d: RenameDeps,
  item: ExportedItem,
  res: Extract<RenameExportResult, { ok: true }>,
  opts: { workName: string; desired: string | null; silent: boolean },
): RenameItemOutcome {
  const unchanged = isSameStockStem(res.diskRenamed, res.alreadyNamed, item.stem, res.uploadName);
  const finalCustom = opts.desired === null || res.uploadName === opts.workName ? null : res.uploadName;
  const stored = setUploadName(item.id, finalCustom, opts.workName);
  if (!opts.silent) {
    if (res.diskRenamed) { d.r.scan.scanKey.current = null; d.runScan(false); }
    const msg = singleRenameMessage({ stored, workName: opts.workName, target: res.uploadName, diskRenamed: res.diskRenamed, unchanged });
    announceItemRename(item.id, msg, d.say);
  }
  return classifyStockOutcome(res.diskRenamed, unchanged);
}

async function renameOneItem(
  d: RenameDeps,
  item: ExportedItem,
  rawName: string | null,
  silent = false,
): Promise<RenameItemOutcome> {
  const root = d.r.root.current;
  if (!root) {
    if (!silent) announceItemRename(item.id, "Choose a workspace folder first", d.say, true);
    return { kind: "failed", reason: "no workspace folder selected" };
  }
  const workName = itemWorkName(item);
  const desired = desiredStem(rawName);
  const res = await renameExportPackage({ root, exportDir: item.exportDir, workName, nextUploadName: desired });
  if (!res.ok) {
    if (!silent) announceItemRename(item.id, `Could not rename ${item.stem} — ${res.reason}`, d.say, true);
    return { kind: "failed", reason: res.reason };
  }
  return finalizeStockRename(d, item, res, { workName, desired, silent });
}

function generatedNameOf(d: RenameDeps, item: ExportedItem): string {
  const meta = d.model.drafts[item.id]?.metadata ?? item.record.metadata;
  return meta ? buildUploadName({ title: meta.title, description: meta.description }) : "";
}

async function renameCheckedItems(d: RenameDeps): Promise<void> {
  if (d.model.uploading) return d.say("Wait for the active upload to finish before renaming files", true);
  const selected = d.items.filter((i) => d.checked.includes(i.id));
  if (selected.length === 0) return d.say("Select items to rename first", true);
  const run = beginRenameRun("stockUpload", selected.length);
  for (const item of selected) {
    if (run.isCancelled()) break;
    run.startItem(item.stem);
    await yieldRenameProgress();
    if (run.isCancelled()) break;
    const gen = generatedNameOf(d, item);
    if (gen === "") { run.record({ kind: "skipped" }); continue; }
    run.record(await renameOneItem(d, item, gen, true));
  }
  const summary = run.finish();
  if (summary.changed > 0) {
    d.r.scan.scanKey.current = null;
    d.runScan(false);
  }
  announceBatchRename("stockUpload", summary, d.say);
}

export function useStockRenameOps(deps: RenameDeps): StockRenameOps {
  const latest = useRef(deps);
  latest.current = deps;
  const renameItem = useCallback((id: string, nextUploadName: string | null) => {
    const d = latest.current;
    if (d.model.uploading) return d.say("Wait for the active upload to finish before renaming files", true);
    const item = d.items.find((i) => i.id === id);
    if (item) void renameOneItem(d, item, nextUploadName, false);
  }, []);
  const renameSelected = useCallback(() => {
    void renameCheckedItems(latest.current);
  }, []);
  return { renameItem, renameSelected };
}
