// ui/useSvgIndex.ts — derive Generate SVG rows only from recursively scanned,
// Selection-approved AI files; file bytes are fingerprinted before sidecar load.

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveFile } from "../../selection/handles";
import type { SelectionV2Api } from "../../selectionv2/useSelectionV2";
import { sha256Hex } from "../../lib/svgcomposite";
import { indexApprovedSource } from "../indexer";
import { subscribeSvgChanges } from "../events";
import { filterAndSortSvgRows } from "../sort";
import { sidecarName } from "../sidecar";
import { stableSvgSourceId } from "../prompt";
import type { SvgSourceRow } from "../types";
import type { SvgPreferences } from "../prefs";

export function useSvgIndex(core: SelectionV2Api["core"], prefs: SvgPreferences) {
  const [rows, setRows] = useState<SvgSourceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [unreadable, setUnreadable] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const { rootRef, rootName, pairs, rescan: rescanSelection, supported } = selectionSnapshot(core);
  const visible = useMemo(() => filterAndSortSvgRows(rows, prefs), [rows, prefs]);
  useEffect(() => watchChanges(setRefresh), []);
  useEffect(() => {
    let live = true;
    void scanSvgRows({ rootRef, pairs, isLive: () => live, setRows, setBusy, setUnreadable });
    return () => { live = false; };
  }, [rootRef, rootName, pairs, refresh]);
  const rescan = useCallback(async () => { await rescanSelection(); setRefresh((value) => value + 1); }, [rescanSelection]);
  return { rows, visible, busy, unreadable, rescan, rootName, supported, rootRef };
}

type SvgPair = SelectionV2Api["core"]["s"]["pairs"][number];

interface ScanSvgRowsInput {
  rootRef: SelectionV2Api["core"]["rootRef"];
  pairs: SvgPair[];
  isLive: () => boolean;
  setRows: (rows: SvgSourceRow[]) => void;
  setBusy: (busy: boolean) => void;
  setUnreadable: (count: number) => void;
}

function selectionSnapshot(core: SelectionV2Api["core"]) {
  return { rootRef: core.rootRef, rootName: core.s.rootName, pairs: core.s.pairs,
    rescan: core.rescan, supported: core.supported };
}

function watchChanges(setRefresh: (update: (value: number) => number) => void): () => void {
  let timer = 0;
  const unsubscribe = subscribeSvgChanges(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => setRefresh((value) => value + 1), 180);
  });
  return () => { window.clearTimeout(timer); unsubscribe(); };
}

async function scanSvgRows(input: ScanSvgRowsInput): Promise<void> {
  const root = input.rootRef.current;
  if (!root) return clearIndex(input);
  input.setBusy(true);
  const eligible = input.pairs.filter((pair) => pair.decision === "approved" && pair.ai);
  const indexed: SvgSourceRow[] = [];
  let errors = 0;
  for (const pair of eligible) {
    if (!input.isLive()) return;
    const row = await indexOne(root, pair);
    if (!row) continue;
    if (row.sidecarState === "missing" && row.generation === "failed") errors++;
    indexed.push(row);
  }
  if (input.isLive()) { input.setRows(indexed); input.setUnreadable(errors); input.setBusy(false); }
}

function clearIndex(input: ScanSvgRowsInput): void {
  input.setRows([]); input.setUnreadable(0); input.setBusy(false);
}

async function indexOne(root: NonNullable<SelectionV2Api["core"]["rootRef"]["current"]>, pair: SvgPair): Promise<SvgSourceRow | null> {
  const path = pair.ai?.relPath;
  if (!path) return null;
  try {
    const handle = await resolveFile(root, path);
    if (!handle) return unreadableRow(pair);
    const fingerprint = await sha256Hex(await handle.getFile());
    return await indexApprovedSource({ root, pair, fingerprint, now: new Date().toISOString() });
  } catch {
    return unreadableRow(pair);
  }
}

function unreadableRow(pair: SvgPair): SvgSourceRow {
  const path = pair.ai?.relPath ?? "";
  const filename = path.split("/").pop() ?? pair.base;
  const parent = path.split("/").slice(0, -1).join("/");
  const sidecar = sidecarName(path);
  return {
    sourceId: stableSvgSourceId(path), pairId: pair.pairId, filename, relativePath: path,
    sourceFingerprint: "", sidecarPath: parent ? `${parent}/${sidecar}` : sidecar,
    sidecarState: "missing", generation: "failed", review: "pending", requests: [], versions: [],
    newestSvg: null, newestPath: null, newestVersion: null, safeError: "Approved AI image could not be read; rescan the source folder.",
    recoverableTempPath: null,
  };
}
