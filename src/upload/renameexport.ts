// renameexport.ts — atomic rename of exported files inside an `export/` folder
// (both `SVG to upload` pair packages and `SVG builder` `_artboard_sheets`
// exports). Keeps `workName` + `pair.id` unchanged while renaming exported
// artifacts (`svg`, `jpeg`, `jpg`, `eps`, `zip`, `png`) to `<uploadName>.<ext>`
// and updating `export.json` (`workName`, `uploadName`, and `outputs.*.path`).

import { nameExists, probePath, readBytesAt, readTextAt, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { isRecord } from "../lib/isrecord";
import { sameBytes } from "./exportcommit";
import {
  parseExportRecord,
  serializeExportRecord,
  stemOf,
  type ExportRecord,
} from "../lib/upload/export";
import { sha256Hex } from "../lib/upload/hash";
import { effectiveExportStem, shrinkUploadNameToBudget } from "../lib/upload/uploadname";

export interface RenameExportArgs {
  root: DirHandleLike;
  exportDir: string;
  workName: string;
  nextUploadName: string | null;
  now?: string;
}

export type RenameExportResult =
  | { ok: true; diskRenamed: boolean; uploadName: string; record: ExportRecord | null }
  | { ok: false; reason: string };

const OUTPUT_KEYS = ["svg", "jpg", "png", "eps", "zip"] as const;
const utf8 = (s: string) => new TextEncoder().encode(s);
const unutf8 = (b: Uint8Array) => new TextDecoder().decode(b);

async function writeVerifiedBytes(dir: DirHandleLike, name: string, expected: Uint8Array): Promise<void> {
  await writeFileOverwrite(dir, name, new Blob([expected as BlobPart]));
  const back = await readBytesAt(dir, name);
  if (back === null || !sameBytes(back, expected)) throw new Error(`verify failed for ${name}`);
}

function fileNameOf(relPath: string): string {
  const norm = relPath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function replaceLeaf(relPath: string, newName: string): string {
  const slash = relPath.replace(/\\/g, "/").lastIndexOf("/");
  return slash >= 0 ? `${relPath.slice(0, slash)}/${newName}` : newName;
}

async function atomicCopy(dir: DirHandleLike, src: Uint8Array, ext: string, toName: string): Promise<void> {
  const stage = `_rename_stage.${ext}`;
  await writeVerifiedBytes(dir, stage, src);
  await writeVerifiedBytes(dir, toName, src);
  try { await dir.removeEntry?.(stage); } catch { /* ignore */ }
}

async function canCreateStem(dir: DirHandleLike, stem: string): Promise<boolean> {
  const probe = `${stem}.jpeg`;
  if (await nameExists("file", dir, probe)) return true;
  try {
    const fh = await dir.getFileHandle(probe, { create: true });
    const w = await fh.createWritable();
    await w.close();
    try { await dir.removeEntry?.(probe); } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

/**
 * Fits `desired` to the OS/filesystem path limit of `dir` (e.g. Win32 MAX_PATH
 * inside deep `_artboard_sheets/.../export/`), stepping down word-by-word so
 * no partial word is ever kept. Falls back to `workName` if needed.
 */
export async function fitStemToDir(dir: DirHandleLike, desired: string, workName: string): Promise<string> {
  if (desired === "" || await canCreateStem(dir, desired)) return desired || workName;
  let cur = desired;
  while (cur.includes("_")) {
    const shorter = shrinkUploadNameToBudget(cur, cur.length - 1);
    if (shorter === "" || shorter === cur) break;
    if (await canCreateStem(dir, shorter)) return shorter;
    cur = shorter;
  }
  return (await canCreateStem(dir, workName)) ? workName : desired;
}

async function commitJson(dir: DirHandleLike, record: ExportRecord): Promise<void> {
  const bytes = utf8(serializeExportRecord(record));
  const stage = "_rename_export.json";
  await writeVerifiedBytes(dir, stage, bytes);
  if (parseExportRecord(JSON.parse(unutf8(bytes))) === null) throw new Error("invalid export.json");
  await writeVerifiedBytes(dir, "export.json", bytes);
  try { await dir.removeEntry?.(stage); } catch { /* ignore */ }
}

interface CopyOutcome { touched: number; obsolete: Set<string> }
interface SlotCopyCtx { dir: DirHandleLike; workName: string; targetStem: string; out: CopyOutcome }

function scrubEpsTitle(src: Uint8Array, ext: string, workName: string): { bytes: Uint8Array; changed: boolean } {
  if (ext !== "eps") return { bytes: src, changed: false };
  const text = unutf8(src);
  const safe = `${workName}.eps`.replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/\s+/g, " ");
  const next = text.replace(/^%%Title:[^\r\n]*/m, `%%Title: ${safe}`);
  return next === text ? { bytes: src, changed: false } : { bytes: utf8(next), changed: true };
}

async function writeSlotBytes(ctx: SlotCopyCtx, slot: Record<string, unknown>, src: Uint8Array, ext: string): Promise<void> {
  const newName = `${ctx.targetStem}.${ext}`;
  const oldName = fileNameOf(slot.path as string);
  const cleaned = scrubEpsTitle(src, ext, ctx.workName);
  if (oldName !== newName || cleaned.changed) {
    await atomicCopy(ctx.dir, cleaned.bytes, ext, newName);
    if (oldName !== newName) ctx.out.obsolete.add(oldName);
  }
  if (cleaned.changed) {
    slot.bytes = cleaned.bytes.byteLength;
    slot.hash = typeof slot.hash === "string" && slot.hash.startsWith("sha256:")
      ? `sha256:${await sha256Hex(cleaned.bytes)}`
      : await sha256Hex(cleaned.bytes);
  }
  slot.path = replaceLeaf(slot.path as string, newName);
  ctx.out.touched += 1;
}

async function copyOneSlot(ctx: SlotCopyCtx, slot: Record<string, unknown>): Promise<{ keep: boolean; oldStem: string }> {
  const oldName = fileNameOf(slot.path as string);
  const ext = extOf(oldName);
  if (ext === "") return { keep: true, oldStem: "" };
  const oldStem = oldName.slice(0, -(ext.length + 1));
  const newName = `${ctx.targetStem}.${ext}`;
  const src = oldName === newName ? await readBytesAt(ctx.dir, newName) : await readBytesAt(ctx.dir, oldName);
  if (src !== null) {
    await writeSlotBytes(ctx, slot, src, ext);
    return { keep: true, oldStem };
  }
  const existing = await readBytesAt(ctx.dir, newName);
  if (existing !== null) {
    await writeSlotBytes(ctx, slot, existing, ext);
    return { keep: true, oldStem };
  }
  return { keep: false, oldStem };
}

async function copyRecordedSlots(
  dir: DirHandleLike,
  record: ExportRecord,
  workName: string,
  targetStem: string,
): Promise<{ outcome: CopyOutcome; slotStems: string[] }> {
  const outs = record.outputs as unknown as Record<string, unknown>;
  const outcome: CopyOutcome = { touched: 0, obsolete: new Set<string>() };
  const slotStems: string[] = [];
  const ctx: SlotCopyCtx = { dir, workName, targetStem, out: outcome };
  for (const key of OUTPUT_KEYS) {
    const slot = outs[key];
    if (!isRecord(slot) || typeof slot.path !== "string") continue;
    const res = await copyOneSlot(ctx, slot);
    if (res.oldStem !== "") slotStems.push(res.oldStem);
    if (!res.keep) outs[key] = null;
  }
  return { outcome, slotStems };
}

async function copyCompanionPngs(dir: DirHandleLike, prevStems: ReadonlySet<string>, targetStem: string, out: CopyOutcome): Promise<void> {
  for (const prev of prevStems) {
    if (!prev || prev === targetStem) continue;
    const oldPng = `${prev}.png`;
    const src = await readBytesAt(dir, oldPng);
    if (src === null) continue;
    await atomicCopy(dir, src, "png", `${targetStem}.png`);
    out.obsolete.add(oldPng);
    out.touched += 1;
  }
}

function safeParseRecord(raw: string): ExportRecord | null {
  try { return parseExportRecord(JSON.parse(raw)); } catch { return null; }
}

async function readCommittedRecord(dir: DirHandleLike | null): Promise<{ ready: boolean; record: ExportRecord | null }> {
  if (dir === null) return { ready: false, record: null };
  const raw = await readTextAt(dir, "export.json");
  const parsed = raw === null ? null : safeParseRecord(raw);
  return { ready: parsed !== null && parsed.timestamps.committedAt !== null, record: parsed };
}

function seedPrevStems(workName: string, record: ExportRecord): Set<string> {
  const baseRaw = (record.pair.base || "").replace(/\.svg$/i, "");
  return new Set<string>([workName, baseRaw, stemOf(record.pair.base || ""), record.uploadName ?? ""]);
}

async function removeObsoleteFiles(dir: DirHandleLike, obsolete: ReadonlySet<string>): Promise<void> {
  for (const oldName of obsolete) {
    try { await dir.removeEntry?.(oldName); } catch { /* ignore */ }
  }
}

async function executeDiskRename(dir: DirHandleLike, loaded: ExportRecord, args: RenameExportArgs, desiredStem: string): Promise<RenameExportResult> {
  const targetStem = await fitStemToDir(dir, desiredStem, args.workName);
  const next: ExportRecord = JSON.parse(JSON.stringify(loaded)) as ExportRecord;
  const prevStems = seedPrevStems(args.workName, next);
  const { outcome, slotStems } = await copyRecordedSlots(dir, next, args.workName, targetStem);
  for (const s of slotStems) prevStems.add(s);
  await copyCompanionPngs(dir, prevStems, targetStem, outcome);
  if (outcome.touched === 0) return { ok: true, diskRenamed: false, uploadName: desiredStem, record: loaded };
  next.workName = args.workName;
  next.uploadName = targetStem;
  next.timestamps.committedAt = args.now ?? new Date().toISOString();
  await commitJson(dir, next);
  await removeObsoleteFiles(dir, outcome.obsolete);
  return { ok: true, diskRenamed: true, uploadName: targetStem, record: next };
}

export async function renameExportPackage(args: RenameExportArgs): Promise<RenameExportResult> {
  const desiredStem = effectiveExportStem(args.workName, args.nextUploadName);
  const dir = args.exportDir === "" ? args.root : await probePath(args.root, args.exportDir);
  const loaded = await readCommittedRecord(dir);
  if (dir === null || !loaded.ready || loaded.record === null) {
    return { ok: true, diskRenamed: false, uploadName: desiredStem, record: loaded.record };
  }
  try {
    return await executeDiskRename(dir, loaded.record, args, desiredStem);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "could not rename exported files" };
  }
}
