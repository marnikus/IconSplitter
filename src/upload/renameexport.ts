// renameexport.ts — atomically renames an already-exported package inside
// `<exportDir>/` to its new `uploadName` while preserving `workName` and `pair.id`
// in `export.json` (RULE 23: write+verify new files -> commit export.json ->
// remove superseded files last, so the user never loses their only copy).

import { probePath, readBytesAt, readTextAt, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { isRecord } from "../lib/isrecord";
import { parseExportRecord, serializeExportRecord, type ExportRecord } from "../lib/upload/export";
import { effectiveExportStem } from "../lib/upload/uploadname";
import { sameBytes } from "./exportcommit";

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

function fileNameOf(path: string): string {
  const clean = path.replace(/\\/g, "/");
  return clean.slice(clean.lastIndexOf("/") + 1);
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

async function writeVerifiedBytes(dir: DirHandleLike, name: string, expected: Uint8Array): Promise<void> {
  await writeFileOverwrite(dir, name, new Blob([expected as BlobPart]));
  const back = await readBytesAt(dir, name);
  if (back === null || !sameBytes(back, expected)) {
    throw new Error(`verify failed for ${name}`);
  }
}

async function atomicCopy(dir: DirHandleLike, fromName: string, toName: string): Promise<void> {
  if (fromName === toName) return;
  const src = await readBytesAt(dir, fromName);
  if (src === null) throw new Error(`missing exported file ${fromName}`);
  const tmp = `${toName}.tmp`;
  await writeVerifiedBytes(dir, tmp, src);
  try {
    await writeVerifiedBytes(dir, toName, src);
  } catch (err) {
    try { await dir.removeEntry?.(toName); } catch { /* ignore */ }
    throw err;
  }
  try { await dir.removeEntry?.(tmp); } catch { /* ignore */ }
}

async function commitJson(dir: DirHandleLike, record: ExportRecord): Promise<void> {
  const bytes = utf8(serializeExportRecord(record));
  const tmp = "export.json.tmp";
  await writeFileOverwrite(dir, tmp, new Blob([bytes as BlobPart]));
  const back = await readBytesAt(dir, tmp);
  if (back === null || parseExportRecord(JSON.parse(unutf8(back))) === null) {
    throw new Error("tmp verify failed for export.json");
  }
  await writeFileOverwrite(dir, "export.json", new Blob([bytes as BlobPart]));
  try { await dir.removeEntry?.(tmp); } catch { /* ignore */ }
}

function collectRenames(record: ExportRecord, targetStem: string): {
  pairs: Array<{ from: string; to: string }>;
  prevStems: Set<string>;
} {
  const outs = record.outputs as unknown as Record<string, unknown>;
  const pairs: Array<{ from: string; to: string }> = [];
  const prevStems = new Set<string>();
  if (record.uploadName) prevStems.add(record.uploadName);
  for (const key of OUTPUT_KEYS) {
    const slot = outs[key];
    if (!isRecord(slot) || typeof slot.path !== "string") continue;
    const oldName = fileNameOf(slot.path);
    const ext = extOf(oldName);
    if (ext === "") continue;
    prevStems.add(oldName.slice(0, -(ext.length + 1)));
    const newName = `${targetStem}.${ext}`;
    pairs.push({ from: oldName, to: newName });
    const slash = slot.path.replace(/\\/g, "/").lastIndexOf("/");
    slot.path = slash >= 0 ? `${slot.path.slice(0, slash)}/${newName}` : newName;
  }
  return { pairs, prevStems };
}

async function copyCompanionPngs(
  dir: DirHandleLike,
  prevStems: ReadonlySet<string>,
  targetStem: string,
  removed: Set<string>,
): Promise<void> {
  for (const prev of prevStems) {
    if (prev === targetStem) continue;
    const oldPng = `${prev}.png`;
    if ((await readBytesAt(dir, oldPng)) === null) continue;
    await atomicCopy(dir, oldPng, `${targetStem}.png`);
    removed.add(oldPng);
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

async function removeObsoleteFiles(dir: DirHandleLike, obsolete: ReadonlySet<string>): Promise<void> {
  for (const oldName of obsolete) {
    try { await dir.removeEntry?.(oldName); } catch { /* ignore */ }
  }
}

async function copyRenamedArtifacts(
  dir: DirHandleLike,
  next: ExportRecord,
  targetStem: string,
): Promise<Set<string>> {
  const { pairs, prevStems } = collectRenames(next, targetStem);
  const obsolete = new Set<string>();
  for (const p of pairs) {
    await atomicCopy(dir, p.from, p.to);
    if (p.from !== p.to) obsolete.add(p.from);
  }
  await copyCompanionPngs(dir, prevStems, targetStem, obsolete);
  return obsolete;
}

export async function renameExportPackage(args: RenameExportArgs): Promise<RenameExportResult> {
  const targetStem = effectiveExportStem(args.workName, args.nextUploadName);
  const dir = args.exportDir === "" ? args.root : await probePath(args.root, args.exportDir);
  const loaded = await readCommittedRecord(dir);
  if (dir === null || !loaded.ready || loaded.record === null) {
    return { ok: true, diskRenamed: false, uploadName: targetStem, record: loaded.record };
  }
  try {
    const next: ExportRecord = JSON.parse(JSON.stringify(loaded.record)) as ExportRecord;
    const obsolete = await copyRenamedArtifacts(dir, next, targetStem);
    next.workName = args.workName;
    next.uploadName = targetStem;
    next.timestamps.committedAt = args.now ?? new Date().toISOString();
    await commitJson(dir, next);
    await removeObsoleteFiles(dir, obsolete);
    return { ok: true, diskRenamed: true, uploadName: targetStem, record: next };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "could not rename exported files" };
  }
}
