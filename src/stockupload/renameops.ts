// renameops.ts — per-item and bulk upload file renaming on the "Upload"
// (stockUpload) tab. Renames exported files in `export/` atomically, updates
// `export.json` (`workName` + `uploadName` + `outputs.*.path`), syncs
// `uploadnamestore`, and rescans while preserving `item.id` and `workName`.

import { useCallback, useRef } from "react";
import type { ExportedItem } from "../lib/stockupload/types";
import { stemOf } from "../lib/upload/export";
import { buildUploadName, sanitizeUploadName } from "../lib/upload/uploadname";
import { renameExportPackage } from "../upload/renameexport";
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

function finishAudibleStockRename(d: RenameDeps, stored: string | null, workName: string, uploadName: string): void {
  d.r.scan.scanKey.current = null;
  d.runScan(false);
  d.say(stored === null ? `Exported files reset to ${workName}` : `Exported files renamed to ${uploadName}`);
}

async function renameOneItem(
  d: RenameDeps,
  item: ExportedItem,
  rawName: string | null,
  silent = false,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const root = d.r.root.current;
  if (!root) {
    if (!silent) d.say("Choose a workspace folder first", true);
    return { ok: false, reason: "no workspace folder selected" };
  }
  const workName = itemWorkName(item);
  const desired = desiredStem(rawName);
  const res = await renameExportPackage({ root, exportDir: item.exportDir, workName, nextUploadName: desired });
  if (!res.ok) {
    if (!silent) d.say(`Could not rename ${item.stem} — ${res.reason}`, true);
    return { ok: false, reason: res.reason };
  }
  const finalCustom = desired === null || res.uploadName === workName ? null : res.uploadName;
  const stored = setUploadName(item.id, finalCustom, workName);
  if (!silent) finishAudibleStockRename(d, stored, workName, res.uploadName);
  return { ok: true };
}

function generatedNameOf(d: RenameDeps, item: ExportedItem): string {
  const meta = d.model.drafts[item.id]?.metadata ?? item.record.metadata;
  return meta ? buildUploadName({ title: meta.title, description: meta.description }) : "";
}

function summarizeStockBatch(renamed: number, skipped: number, failures: readonly string[]): { msg: string; err: boolean } {
  if (renamed === 0 && failures.length > 0) {
    return { msg: `Could not rename exported packages (${failures.length} failed) — ${failures[0]}`, err: true };
  }
  if (renamed === 0) {
    return { msg: "No selected packages have Title + Description metadata to build an upload name", err: true };
  }
  const parts = [`Renamed ${renamed} package(s) for upload`];
  if (skipped > 0) parts.push(`${skipped} skipped (no metadata)`);
  if (failures.length > 0) parts.push(`${failures.length} failed (${failures[0]})`);
  return { msg: parts.join(" · "), err: failures.length > 0 };
}

async function renameCheckedItems(d: RenameDeps): Promise<void> {
  if (d.model.uploading) return d.say("Wait for the active upload to finish before renaming files", true);
  const selected = d.items.filter((i) => d.checked.includes(i.id));
  if (selected.length === 0) return d.say("Select items to rename first", true);
  d.dispatch({ type: "patch", patch: { busy: `Renaming ${selected.length} package(s)…` } });
  let renamed = 0;
  let skipped = 0;
  const failures: string[] = [];
  try {
    for (const item of selected) {
      const gen = generatedNameOf(d, item);
      if (gen === "") { skipped += 1; continue; }
      const out = await renameOneItem(d, item, gen, true);
      if (out.ok) renamed += 1;
      else failures.push(out.reason);
    }
  } finally {
    d.dispatch({ type: "patch", patch: { busy: null } });
  }
  if (renamed > 0) {
    d.r.scan.scanKey.current = null;
    d.runScan(false);
  }
  const summary = summarizeStockBatch(renamed, skipped, failures);
  d.say(summary.msg, summary.err);
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
