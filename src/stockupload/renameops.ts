// renameops.ts — per-item and bulk upload file renaming on the "Upload"
// (stockUpload) tab. Renames exported files in `export/` atomically, updates
// `export.json` (`workName` + `uploadName` + `outputs.*.path`), syncs
// `uploadnamestore`, and rescans while preserving `item.id` and `workName`.

import { useCallback, useRef } from "react";
import type { ExportedItem } from "../lib/stockupload/types";
import { stemOf } from "../lib/upload/export";
import { buildUploadName, effectiveExportStem } from "../lib/upload/uploadname";
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

async function renameOneItem(d: RenameDeps, item: ExportedItem, rawName: string | null, silent = false): Promise<boolean> {
  const root = d.r.root.current;
  if (!root) {
    if (!silent) d.say("Choose a workspace folder first", true);
    return false;
  }
  const workName = itemWorkName(item);
  const stored = setUploadName(item.id, rawName, workName);
  const target = effectiveExportStem(workName, stored);
  const res = await renameExportPackage({ root, exportDir: item.exportDir, workName, nextUploadName: stored });
  if (!res.ok) {
    if (!silent) d.say(`Could not rename ${item.stem} — ${res.reason}`, true);
    return false;
  }
  if (!silent) {
    d.r.scan.scanKey.current = null;
    d.runScan(false);
    d.say(stored === null ? `Exported files reset to ${workName}` : `Exported files renamed to ${target}`);
  }
  return true;
}

function generatedNameOf(d: RenameDeps, item: ExportedItem): string {
  const meta = d.model.drafts[item.id]?.metadata ?? item.record.metadata;
  return meta ? buildUploadName({ title: meta.title, description: meta.description }) : "";
}

async function renameCheckedItems(d: RenameDeps): Promise<void> {
  if (d.model.uploading) return d.say("Wait for the active upload to finish before renaming files", true);
  const selected = d.items.filter((i) => d.checked.includes(i.id));
  if (selected.length === 0) return d.say("Select items to rename first", true);
  d.dispatch({ type: "patch", patch: { busy: `Renaming ${selected.length} package(s)…` } });
  let renamed = 0;
  let skipped = 0;
  try {
    for (const item of selected) {
      const gen = generatedNameOf(d, item);
      if (gen === "") { skipped += 1; continue; }
      if (await renameOneItem(d, item, gen, true)) renamed += 1;
    }
  } finally {
    d.dispatch({ type: "patch", patch: { busy: null } });
  }
  if (renamed === 0) return d.say("No selected packages have Title + Description metadata to build an upload name", true);
  d.r.scan.scanKey.current = null;
  d.runScan(false);
  d.say(skipped > 0 ? `Renamed ${renamed} package(s) for upload · ${skipped} skipped (no metadata)` : `Renamed ${renamed} package(s) for upload`);
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
