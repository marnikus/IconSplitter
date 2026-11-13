// scan.ts — this tab's remembered root and all-folder approved scan. One
// monotonically increasing ticket means an older scan can never replace a newer
// one; the snapshot key avoids committing an unchanged folder twice.
import { loadHandles, saveHandles } from "../batch/store";
import type { DirHandleLike } from "../lib/fs";
import { fnv1a32 } from "../lib/pairing";
import { beginScan, isCurrent, type ScanSeq } from "../lib/scanseq";
import { restoreKnownRoot } from "../lib/knownroots";
import { rememberListTargets } from "../state/listtargets";
import { ALL_EMPTY_SLOTS } from "../lib/svgBuilder/slots";
import { builderAuditLine, discoverBuilderAssets, type BuilderDiscovery } from "./discovery";
import { refreshIconMap, type IconMapState } from "./iconmapstore";

export const BUILDER_HANDLE_KEY = "__svgBuilder__";

export interface BuilderScanRefs {
  seq: ScanSeq;
  scanKey: { current: string | null };
}

export interface BuilderScanSetters {
  setRoot: (root: DirHandleLike | null) => void;
  setDiscovery: (found: BuilderDiscovery | null) => void;
  setBusy: (busy: string | null) => void;
  say: (message: string, error?: boolean) => void;
  /** icon-map.json was (re)written after the scan (2026-11-13). */
  setIconMap?: (state: IconMapState) => void;
}

export async function rememberBuilderRoot(handle: DirHandleLike): Promise<void> {
  await saveHandles(BUILDER_HANDLE_KEY, { source: handle });
}

/** The other tabs' remembered folders, in the order the builder may borrow one. */
const BORROWED_KEYS = ["__upload__", "__svg__", "__selection__"] as const;

async function borrowedRoot(): Promise<DirHandleLike | null> {
  for (const key of BORROWED_KEYS) {
    const handle = (await loadHandles(key))?.source ?? null;
    if (handle !== null) return handle;
  }
  return null;
}

export async function bootBuilderRoot(): Promise<DirHandleLike | null> {
  const own = (await loadHandles(BUILDER_HANDLE_KEY))?.source ?? null;
  const stored = own ?? await borrowedRoot();
  if (stored !== null) await restoreKnownRoot(stored);
  // A folder borrowed from another tab becomes the builder's own: a decline (🗑)
  // finds its pair files through this key (2026-11-13).
  if (own === null && stored !== null) await rememberBuilderRoot(stored).catch(() => undefined);
  return stored;
}

export async function scanBuilderRoot(
  refs: BuilderScanRefs, root: DirHandleLike, setters: BuilderScanSetters,
): Promise<void> {
  const ticket = beginScan(refs.seq);
  refs.seq = ticket.seq;
  setters.setBusy("Scanning approved SVGs in all folders…");
  try {
    const found = await discoverBuilderAssets(root);
    if (!isCurrent(refs.seq, ticket.id)) return;
    const key = scanKeyOf(root.name, found);
    if (key === refs.scanKey.current) return;
    refs.scanKey.current = key;
    setters.setRoot(root);
    setters.setDiscovery(found);
    rememberListTargets("svgBuilder", [...found.assets.map((a) => a.id), ...ALL_EMPTY_SLOTS]);
    void refreshIconMap(root, found.assets).then((state) => {
      if (!isCurrent(refs.seq, ticket.id)) return;
      setters.setIconMap?.(state);
      if (state.error !== null) setters.say(state.error, true);
    });
    setters.say(builderAuditLine(found));
    for (const warning of warnings(found)) setters.say(warning, true);
  } catch {
    if (isCurrent(refs.seq, ticket.id)) setters.say("Rescan failed — the folder may be unreadable", true);
  } finally {
    if (isCurrent(refs.seq, ticket.id)) setters.setBusy(null);
  }
}

function scanKeyOf(rootName: string, found: BuilderDiscovery): string {
  const canonical = JSON.stringify({
    root: rootName,
    rows: found.rows.map((r) => [r.id, r.svgPath, r.fingerprint, r.version]),
    excluded: found.excluded.map((e) => [e.id, e.kind]),
    audit: found.audit,
  });
  return fnv1a32(canonical).toString(16);
}

function warnings(found: BuilderDiscovery): string[] {
  return [
    ...(found.corruptFiles.length > 0 ? [`${found.corruptFiles.length} pair file(s) could not be parsed`] : []),
    ...(found.excluded.length > 0 ? [`${found.excluded.length} pair(s) have no approved SVG version`] : []),
    ...(found.unreadable.length > 0 ? [`${found.unreadable.length} file(s) could not be read`] : []),
  ];
}
