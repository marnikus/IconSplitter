// scan.ts — root handle persistence & strict export/+export.json scan (RULE 4/10).

import { loadHandles, saveHandles } from "../batch/store";
import type { DirHandleLike } from "../lib/fs";
import { restoreKnownRoot } from "../lib/knownroots";
import { fnv1a32 } from "../lib/pairing";
import { beginScan, isCurrent, type ScanSeq } from "../lib/scanseq";
import { discoverExportedItems, type StockDiscovery } from "../lib/stockupload/discovery";
import { startCompletionSound } from "../ui/completionSound";

export const STOCK_UPLOAD_HANDLE_KEY = "__stock_upload__";

export interface StockScanRefs {
  seq: ScanSeq;
  scanKey: { current: string | null };
}

export interface StockScanSetters {
  setRootName: (name: string) => void;
  setDiscovery: (d: StockDiscovery) => void;
  setBusy: (b: string | null) => void;
  say: (msg: string, err?: boolean) => void;
}

export async function rememberStockRoot(handle: DirHandleLike): Promise<void> {
  await saveHandles(STOCK_UPLOAD_HANDLE_KEY, { source: handle });
}

export async function bootStockRoot(): Promise<DirHandleLike | null> {
  const stored = (await loadHandles(STOCK_UPLOAD_HANDLE_KEY))?.source
    ?? (await loadHandles("__upload__"))?.source
    ?? (await loadHandles("__svg__"))?.source
    ?? (await loadHandles("__selection__"))?.source
    ?? null;
  if (stored !== null) await restoreKnownRoot(stored);
  return stored;
}

function scanFingerprint(rootName: string, found: StockDiscovery): string {
  const payload = {
    root: rootName,
    items: found.items.map((it) => [it.id, it.recordPath, it.record.timestamps.committedAt, it.files]),
    audit: found.audit,
  };
  return fnv1a32(JSON.stringify(payload)).toString(16);
}

export function stockAuditLine(found: StockDiscovery): string {
  return `${found.items.length} exported package(s) · ${found.audit.exportFolders} export folder(s) · ${found.audit.unrecordedFiles} unrecorded file(s) ignored`;
}

function scanWarnings(found: StockDiscovery): string[] {
  const warns: string[] = [];
  if (found.corruptRecords.length > 0) warns.push(`${found.corruptRecords.length} export.json file(s) are corrupt and skipped`);
  if (found.unreadable.length > 0) warns.push(`${found.unreadable.length} export.json file(s) could not be read`);
  if (found.audit.missingRecordedFiles > 0) warns.push(`${found.audit.missingRecordedFiles} recorded output file(s) are missing from export/`);
  return warns;
}

export async function scanStockUpload(
  refs: StockScanRefs,
  root: DirHandleLike,
  setters: StockScanSetters,
  audible = false,
): Promise<void> {
  const finish = audible ? startCompletionSound() : () => undefined;
  const ticket = beginScan(refs.seq);
  refs.seq = ticket.seq;
  setters.setBusy("Scanning export/ folders…");
  try {
    const found = await discoverExportedItems(root);
    if (!isCurrent(refs.seq, ticket.id)) return;
    const key = scanFingerprint(root.name, found);
    if (key === refs.scanKey.current) return;
    refs.scanKey.current = key;
    setters.setRootName(root.name);
    setters.setDiscovery(found);
    for (const w of scanWarnings(found)) setters.say(w, true);
  } catch {
    if (isCurrent(refs.seq, ticket.id)) setters.say("Rescan failed — the folder may be unreadable", true);
  } finally {
    if (isCurrent(refs.seq, ticket.id)) setters.setBusy(null);
    finish(!isCurrent(refs.seq, ticket.id));
  }
}
