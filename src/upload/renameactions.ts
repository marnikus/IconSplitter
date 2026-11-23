// renameactions.ts — per-row and bulk upload file renaming for the "SVG to upload"
// tab. Keeps each pair's ID and working name (`workName`) unchanged; persists
// `uploadName` locally before export and atomically renames existing `export/`
// files + updates `export.json` when already exported.

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { exportDirOf, stemOf, type ExportRecord } from "../lib/upload/export";
import { buildUploadName, effectiveExportStem } from "../lib/upload/uploadname";
import type { Slice, UploadCtx } from "./actions";
import { renameExportPackage } from "./renameexport";
import type { UploadRow } from "./types";
import { setUploadName } from "./uploadnamestore";

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

async function applyOneRowRename(
  c: UploadCtx,
  row: UploadRow,
  rawName: string | null,
  silent = false,
): Promise<"disk" | "pending" | "failed"> {
  const workName = stemOf(row.source.svgName);
  const stored = setUploadName(row.source.id, rawName, workName);
  const target = effectiveExportStem(workName, stored);
  const root = c.refs.root.current as DirHandleLike | null;
  const res = root !== null
    ? await renameExportPackage({ root, exportDir: exportDirOf(row.source.dirPath), workName, nextUploadName: stored })
    : { ok: true as const, diskRenamed: false, uploadName: target, record: null };
  if (!res.ok) {
    if (!silent) c.say(`Could not rename exported files — ${res.reason}`, true);
    return "failed";
  }
  if (res.diskRenamed && res.record !== null) patchRowRecord(c, row.source.id, res.record);
  if (!silent) c.say(renameRowMessage(stored, workName, target, res.diskRenamed));
  return res.diskRenamed ? "disk" : "pending";
}

async function renameBatch(c: UploadCtx, ids: readonly string[]): Promise<void> {
  const selected = c.rows.filter((r) => ids.includes(r.source.id));
  if (selected.length === 0) return c.say("Check the icons to rename first", true);
  let disk = 0;
  let pending = 0;
  let skipped = 0;
  for (const row of selected) {
    const m = row.meta.metadata;
    const gen = m ? buildUploadName({ title: m.title, description: m.description }) : "";
    if (gen === "") { skipped += 1; continue; }
    const out = await applyOneRowRename(c, row, gen, true);
    if (out === "disk") disk += 1;
    else if (out === "pending") pending += 1;
  }
  if (disk + pending === 0) return c.say("No selected icons have Title + Description metadata to build an upload name", true);
  const parts = [`Renamed ${disk + pending} icon(s) for upload`];
  if (pending > 0) parts.push(`${pending} ready for first export`);
  if (skipped > 0) parts.push(`${skipped} skipped (no metadata)`);
  c.say(parts.join(" · "));
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
