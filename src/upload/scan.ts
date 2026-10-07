// scan.ts — scanning the picked root for the "SVG to upload" tab (design §3.2).
// Mirrors svg/scan.ts: one ticket per scan, discovery, ONE complete commit,
// an unchanged snapshot commits nothing, and only the newest scan may commit
// (scanseq). The setters are plain callbacks so the orchestration is testable
// without the store.

import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { beginScan, isCurrent, type ScanSeq } from "../lib/scanseq";
import { fnv1a32 } from "../lib/pairing";
import { loadHandles, saveHandles } from "../batch/store";
import { loadRootPath } from "../lib/rootpath";
import { rememberKnownRoot } from "../ui/knownroots";
import { discoverUploadSources, type UploadDiscovery, type UploadRowSource } from "./discovery";

/** This tab's remembered root handle (its own slot, like `__svg__`). */
export const UPLOAD_HANDLE_KEY = "__upload__";

export interface UploadScanSetters {
  setRootName: (name: string) => void;
  setRows: (rows: UploadRowSource[]) => void;
  setDiscovery: (d: UploadDiscovery | null) => void;
  setBusy: (b: string | null) => void;
  say: (msg: string, err?: boolean) => void;
}

export interface UploadScanRefs {
  /** Mutated in place: the monotonic scan ticket state. */
  seq: ScanSeq;
  /** The snapshot key of the last committed scan (unchanged → no commit). */
  key: { current: string | null };
}

/** Scans the root and commits one complete snapshot (or nothing). */
export async function scanUpload(refs: UploadScanRefs, root: DirHandleLike, setters: UploadScanSetters): Promise<void> {
  const ticket = beginScan(refs.seq);
  refs.seq = ticket.seq;
  setters.setBusy("Scanning approved SVGs…");
  try {
    const found = await discoverUploadSources(root);
    if (!isCurrent(refs.seq, ticket.id)) return; // a newer scan took over
    const key = scanKeyOf(root.name, found);
    if (key === refs.key.current) return; // same folder, same snapshot: nothing to do
    setters.setRootName(root.name);
    setters.setRows(found.rows);
    setters.setDiscovery(found);
    refs.key.current = key;
    log({ feature: "upload", action: "scan", detail: auditLine(found), data: { ...found.audit, corruptFiles: found.corruptFiles.length } });
    for (const warning of warnings(found)) setters.say(warning, true);
  } catch {
    if (isCurrent(refs.seq, ticket.id)) {
      log({ level: "error", feature: "upload", action: "scan-failed", detail: "the scan failed — the folder may be unreadable" });
      setters.say("Rescan failed — the folder may be unreadable", true);
    }
  } finally {
    if (isCurrent(refs.seq, ticket.id)) setters.setBusy(null);
  }
}

/** The one audit line the source bar shows and the scan logs (RULE 10). */
export function auditLine(found: UploadDiscovery): string {
  return `${found.rows.length} approved SVG(s) · ${found.audit.svgFiles} SVG file(s) · ${found.excluded.length} pair(s) not listed · ${found.corruptFiles.length} corrupt pair file(s)`;
}

/** Remembers the folder the user picked for this tab. */
export async function rememberRoot(handle: DirHandleLike): Promise<void> {
  await saveHandles(UPLOAD_HANDLE_KEY, { source: handle });
}

/** Restores the remembered root: this tab's handle, else Generate SVG's, else Selection's. */
export async function bootRoot(): Promise<DirHandleLike | null> {
  const stored = (await loadHandles(UPLOAD_HANDLE_KEY))?.source
    ?? (await loadHandles("__svg__"))?.source
    ?? (await loadHandles("__selection__"))?.source
    ?? null;
  if (stored !== null) rememberKnownRoot(stored, loadRootPath(stored.name)); // a restored folder names its children (I-51)
  return stored;
}

/** The snapshot key: a stable fingerprint of what the scan found. */
function scanKeyOf(rootName: string, found: UploadDiscovery): string {
  const canonical = JSON.stringify({
    root: rootName,
    rows: found.rows.map((r) => [r.id, r.svgPath, r.fingerprint, r.version]),
    excluded: found.excluded.map((e) => [e.id, e.kind]),
    audit: found.audit,
  });
  return fnv1a32(canonical).toString(16);
}

function warnings(found: UploadDiscovery): string[] {
  return [
    ...(found.corruptFiles.length > 0 ? [`${found.corruptFiles.length} pair file(s) could not be parsed — their pairs are not listed`] : []),
    ...(found.excluded.length > 0 ? [`${found.excluded.length} pair(s) have no approved SVG version — approve one in Generate SVG first`] : []),
    ...(found.unreadable.length > 0 ? [`${found.unreadable.length} file(s) could not be read and are marked unreadable`] : []),
  ];
}
