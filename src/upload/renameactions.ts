// renameactions.ts — per-row and bulk upload file renaming for the "SVG to upload"
// tab. Keeps each pair's ID and working name (`workName`) unchanged; persists
// `uploadName` locally before export and atomically renames existing `export/`
// files + updates `export.json` when already exported.

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { exportDirOf, stemOf, type ExportRecord } from "../lib/upload/export";
import { buildUploadName, effectiveExportStem, sanitizeUploadName } from "../lib/upload/uploadname";
import type { Slice, UploadCtx } from "./actions";
import { renameExportPackage, type RenameExportResult } from "./renameexport";
import type { UploadRow } from "./types";
import { setUploadName } from "./uploadnamestore";

type RowOutcome = { kind: "disk" | "pending" } | { kind: "failed"; reason: string };

function patchRowRecord(c: UploadCtx, id: string, record: ExportRecord): void {
  c.refs.scanKey.current = null;
  c.dispatch({
    type: "rows-fn",
    fn: (rows: UploadRow[]) => rows.map((r) => (r.source.id !== id ? r : { ...r, record })),
  });
}

function renameRowMessage(stored: string | null, workName: string, target: string, diskRenamed: boolean): string {
  if (diskRenamed) return stored === null ? `Exported files reset to ${workName}` : `Exported files renamed to ${target}`;
  return stored === null ? `Upload file name reset to ${workName}` : `Upload file name saved for export: ${target}`;
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

async function applyOneRowRename(c: UploadCtx, row: UploadRow, rawName: string | null, silent = false): Promise<RowOutcome> {
  const workName = stemOf(row.source.svgName);
  const desired = desiredRowStem(rawName);
  const res = await renameRowOnDisk(c.refs.root.current as DirHandleLike | null, row.source.dirPath, workName, desired);
  if (!res.ok) {
    if (!silent) c.say(`Could not rename exported files — ${res.reason}`, true);
    return { kind: "failed", reason: res.reason };
  }
  const finalCustom = desired === null || res.uploadName === workName ? null : res.uploadName;
  const stored = setUploadName(row.source.id, finalCustom, workName);
  if (res.diskRenamed && res.record !== null) patchRowRecord(c, row.source.id, res.record);
  if (!silent) c.say(renameRowMessage(stored, workName, res.uploadName, res.diskRenamed));
  return { kind: res.diskRenamed ? "disk" : "pending" };
}

function summarizeRowBatch(counts: { disk: number; pending: number; skipped: number; failures: string[] }): { msg: string; err: boolean } {
  const okTotal = counts.disk + counts.pending;
  if (okTotal === 0 && counts.failures.length > 0) {
    return { msg: `Could not rename exported files (${counts.failures.length} failed) — ${counts.failures[0]}`, err: true };
  }
  if (okTotal === 0) {
    return { msg: "No selected icons have Title + Description metadata to build an upload name", err: true };
  }
  const parts = [`Renamed ${okTotal} icon(s) for upload`];
  if (counts.pending > 0) parts.push(`${counts.pending} ready for first export`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped (no metadata)`);
  if (counts.failures.length > 0) parts.push(`${counts.failures.length} failed (${counts.failures[0]})`);
  return { msg: parts.join(" · "), err: counts.failures.length > 0 };
}

async function renameBatch(c: UploadCtx, ids: readonly string[]): Promise<void> {
  const selected = c.rows.filter((r) => ids.includes(r.source.id));
  if (selected.length === 0) return c.say("Check the icons to rename first", true);
  const counts = { disk: 0, pending: 0, skipped: 0, failures: [] as string[] };
  for (const row of selected) {
    const m = row.meta.metadata ?? row.record?.metadata ?? null;
    const gen = m ? buildUploadName({ title: m.title, description: m.description }) : "";
    if (gen === "") { counts.skipped += 1; continue; }
    const out = await applyOneRowRename(c, row, gen, true);
    if (out.kind === "failed") counts.failures.push(out.reason);
    else counts[out.kind] += 1;
  }
  const summary = summarizeRowBatch(counts);
  c.say(summary.msg, summary.err);
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
