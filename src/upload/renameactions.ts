// renameactions.ts — per-row and bulk upload file renaming for the "SVG to upload"
// tab. Keeps each pair's ID and working name (`workName`) unchanged; persists
// `uploadName` locally before export, atomically renames existing `export/`
// files + updates `export.json` when already exported, and publishes live
// ProcessProgressBar + per-row feedback.

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { exportDirOf, stemOf, type ExportRecord } from "../lib/upload/export";
import { buildUploadName, effectiveExportStem, sanitizeUploadName } from "../lib/upload/uploadname";
import type { Slice, UploadCtx } from "./actions";
import { renameExportPackage, type RenameExportResult } from "./renameexport";
import { announceItemRename, singleRenameMessage } from "./renamefeedback";
import {
  announceBatchRename,
  beginRenameRun,
  yieldRenameProgress,
  type RenameItemOutcome,
} from "./renameprogress";
import type { UploadRow } from "./types";
import { getUploadName, setUploadName } from "./uploadnamestore";

function patchRowRecord(c: UploadCtx, id: string, record: ExportRecord): void {
  c.refs.scanKey.current = null;
  c.dispatch({
    type: "rows-fn",
    fn: (rows: UploadRow[]) => rows.map((r) => (r.source.id !== id ? r : { ...r, record })),
  });
}

function desiredRowStem(rawName: string | null): string | null {
  return rawName === null ? null : (sanitizeUploadName(rawName) || null);
}

async function renameRowOnDisk(root: DirHandleLike | null, dirPath: string, workName: string, desired: string | null): Promise<RenameExportResult> {
  if (root === null) {
    return { ok: true, diskRenamed: false, uploadName: effectiveExportStem(workName, desired), record: null };
  }
  return renameExportPackage({ root, exportDir: exportDirOf(dirPath), workName, nextUploadName: desired });
}

function classifyRowOutcome(diskRenamed: boolean, unchanged: boolean): RenameItemOutcome {
  if (diskRenamed) return { kind: "disk" };
  return unchanged ? { kind: "unchanged" } : { kind: "pending" };
}

function isAlreadySameName(diskRenamed: boolean, alreadyNamed: boolean | undefined, prev: string, next: string): boolean {
  return !diskRenamed && (alreadyNamed === true || prev === next);
}

function finalizeRowRename(
  c: UploadCtx,
  row: UploadRow,
  res: Extract<RenameExportResult, { ok: true }>,
  opts: { workName: string; prevEffective: string; desired: string | null; silent: boolean },
): RenameItemOutcome {
  const unchanged = isAlreadySameName(res.diskRenamed, res.alreadyNamed, opts.prevEffective, res.uploadName);
  const finalCustom = opts.desired === null || res.uploadName === opts.workName ? null : res.uploadName;
  const stored = setUploadName(row.source.id, finalCustom, opts.workName);
  if (res.diskRenamed && res.record !== null) patchRowRecord(c, row.source.id, res.record);
  if (!opts.silent) {
    const msg = singleRenameMessage({ stored, workName: opts.workName, target: res.uploadName, diskRenamed: res.diskRenamed, unchanged });
    announceItemRename(row.source.id, msg, c.say);
  }
  return classifyRowOutcome(res.diskRenamed, unchanged);
}

async function applyOneRowRename(c: UploadCtx, row: UploadRow, rawName: string | null, silent = false): Promise<RenameItemOutcome> {
  const workName = stemOf(row.source.svgName);
  const prevEffective = effectiveExportStem(workName, getUploadName(row.source.id) ?? row.record?.uploadName ?? null);
  const desired = desiredRowStem(rawName);
  const res = await renameRowOnDisk(c.refs.root.current as DirHandleLike | null, row.source.dirPath, workName, desired);
  if (!res.ok) {
    if (!silent) announceItemRename(row.source.id, `Could not rename exported files — ${res.reason}`, c.say, true);
    return { kind: "failed", reason: res.reason };
  }
  return finalizeRowRename(c, row, res, { workName, prevEffective, desired, silent });
}

async function renameBatch(c: UploadCtx, ids: readonly string[]): Promise<void> {
  const selected = c.rows.filter((r) => ids.includes(r.source.id));
  if (selected.length === 0) return c.say("Check the icons to rename first", true);
  const run = beginRenameRun("upload", selected.length);
  for (const row of selected) {
    if (run.isCancelled()) break;
    run.startItem(row.source.svgName);
    await yieldRenameProgress();
    if (run.isCancelled()) break;
    const m = row.meta.metadata ?? row.record?.metadata ?? null;
    const gen = m ? buildUploadName({ title: m.title, description: m.description }) : "";
    if (gen === "") { run.record({ kind: "skipped" }); continue; }
    run.record(await applyOneRowRename(c, row, gen, true));
  }
  announceBatchRename("upload", run.finish(), c.say);
}

export function useRenameActions(ctx: UploadCtx): Slice<"setRowUploadName" | "renameSelectedForUpload"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setRowUploadName = useCallback((id: string, next: string | null) => {
    const c = latest.current;
    const row = c.rows.find((r) => r.source.id === id);
    if (row) void applyOneRowRename(c, row, next);
  }, []);
  const renameSelectedForUpload = useCallback((ids: string[]) => {
    void renameBatch(latest.current, ids);
  }, []);
  return { setRowUploadName, renameSelectedForUpload };
}
