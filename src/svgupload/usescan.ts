// usescan.ts — the folder this tab works in and the scan that fills it (design
// §2/§3, I-44). Split from useUpload so that hook stays the wiring between the
// list, the settings and the jobs, while the part that talks to the FILESYSTEM
// lives here: the remembered root, the one shared picker, the race-safe runner
// and the package read that makes an interrupted publication visible.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { loadHandles, saveHandles } from "../batch/store";
import { SVG_HANDLE_KEY } from "../svg/reviewundo";
import { discoverApprovedSources } from "../svg/sources";
import { pickRootWithPath } from "../ui/pickroot";
import { buildUploadRows, exportBaseName, exportStateOf, type UploadRow } from "../lib/svgupload/rows";
import type { UploadSourceInput } from "../lib/svgupload/rows";
import { readPackage } from "./package";
import { attachSourceHashes } from "./scanhash";

/** What the scan exposes to the panel: the folder, the rows and its own voice. */
export interface ScanApi {
  root: DirHandleLike | null;
  rows: UploadRow[];
  busy: string | null;
  toast: string | null;
  chooseRoot: () => void;
  rescan: () => void;
  dismissToast: () => void;
  say: (message: string | null) => void;
}

/** The scan + its outcomes: root handle, rows, busy text, toast. */
export function useScan(): ScanApi {
  const [root, setRoot] = useState<DirHandleLike | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const token = useRef(0);
  const clear = useCallback(() => setToast(null), []);
  const run = useScanRunner(setRows, setBusy, setToast, token);
  const chooseRoot = useRootPicker(setRoot, run);
  useBootRestore(setRoot, run);
  return {
    root, rows, busy, toast, chooseRoot, dismissToast: clear, say: setToast,
    rescan: () => { if (root !== null) void run(root); },
  };
}

/** Runs one scan; a stale answer from an earlier folder is dropped, not shown. */
function useScanRunner(
  setRows: (rows: UploadRow[]) => void, setBusy: (t: string | null) => void,
  setToast: (t: string | null) => void, token: { current: number },
) {
  return useCallback(async (picked: DirHandleLike) => {
    const id = ++token.current;
    setBusy("Scanning approved SVGs…");
    try {
      const next = await scanRows(picked);
      if (token.current !== id) return;
      setRows(next);
      setToast(next.length === 0 ? "No approved SVGs found in this folder." : null);
    } catch {
      if (token.current === id) setToast("The scan could not read this folder — check the permissions and try again.");
    } finally {
      if (token.current === id) setBusy(null);
    }
  }, [setRows, setBusy, setToast, token]);
}

/** The folder the other tabs already remember is THIS tab's folder too (I-44). */
function useBootRestore(setRoot: (h: DirHandleLike) => void, run: (h: DirHandleLike) => Promise<void>) {
  useEffect(() => {
    void (async () => {
      const stored = (await loadHandles(SVG_HANDLE_KEY))?.source ?? (await loadHandles("__selection__"))?.source ?? null;
      if (stored === null) return;
      setRoot(stored);
      await run(stored);
    })();
  }, [setRoot, run]);
}

/** The one picker every tab uses; a cancelled pick changes nothing. */
function useRootPicker(setRoot: (h: DirHandleLike) => void, run: (h: DirHandleLike) => Promise<void>) {
  return useCallback(async () => {
    const picked = await pickRootWithPath();
    if (picked === null) return;
    setRoot(picked.handle);
    await saveHandles(SVG_HANDLE_KEY, { source: picked.handle }); // both SVG tabs share one root
    await run(picked.handle);
  }, [setRoot, run]);
}

/** The scan itself: discovery -> rows, with the content hash and each package read. */
async function scanRows(picked: DirHandleLike): Promise<UploadRow[]> {
  const discovery = await discoverApprovedSources(picked);
  const inputs = await Promise.all(discovery.sources.map(async (s) => ({
    source: s,
    meta: discovery.metas.get(s.id) ?? null,
    exists: (rel: string) => discovery.fileIndex.has(rel),
    fingerprintOf: (rel: string) => discovery.fileIndex.get(rel) ?? "",
    exportState: await stateOfPackage(picked, s),
  })));
  // The rows exist first, because which FILE is the source is the row's decision
  // (preferred + approved); only then can that file's content be identified.
  return await attachSourceHashes(picked, buildUploadRows(inputs));
}

/**
 * What the icon's own export folder holds right now — read for every row, so an
 * interrupted publication is visible instead of silently reusable (R01).
 */
async function stateOfPackage(root: DirHandleLike, source: UploadSourceInput): Promise<ReturnType<typeof exportStateOf>> {
  const read = await readPackage(root, source.dirPath, exportBaseName(source.name));
  return exportStateOf(read);
}
