// useUploadRun.ts — the actions that touch the disk and the provider (RULE 10/13).
// Owns: opening the folder, discovering the approved SVGs, reading each icon's
// existing package, generating metadata (one paid call per icon), exporting,
// cancelling, and showing where a package landed. Nothing uploads, and nothing
// runs without a click.
//
// Every rule they follow lives elsewhere: discovery in `svg/sources`, the pack-
// age in `lib/uploadpipeline`, the request in `lib/geminiclient`. This file is the
// single place those calls are made from, so the tab has one writer per value —
// and each action reads the store at call time, never a render-time snapshot.

import { useCallback, useRef, useState } from "react";
import { ensurePermission, pickDirectory } from "../batch/picker";
import { loadHandles, saveHandles } from "../batch/store";
import type { DirHandleLike } from "../lib/fs";
import type { ExportRecord } from "../lib/uploadrecord";
import type { MetadataRecord } from "../lib/uploadmeta";
import { discoverApprovedSources } from "../svg/sources";
import { loadApiKey } from "../svg/keystore";
import { generateFor } from "./generate";
import { loadCode, loadRecord, runRows } from "./run";
import { rowFromSource, type UploadRow } from "./rows";
import { browserDeps } from "../lib/uploadraster";
import { getUploadState, note, setUploadState } from "./store";
import { runContext } from "./rundeps";

export const UPLOAD_HANDLE_KEY = "__upload__";

export interface RunApi {
  supported: boolean;
  rootName: string;
  busy: boolean;
  runNote: string | null;
  preview: { name: string; code: string } | null;
  chooseRoot: () => Promise<void>;
  rescan: () => Promise<void>;
  generate: (ids: readonly string[]) => Promise<void>;
  exportRows: (ids: readonly string[]) => Promise<void>;
  cancel: () => void;
  openExport: (row: UploadRow) => Promise<void>;
  openPreview: (row: UploadRow) => Promise<void>;
  closePreview: () => void;
  setRunNote: (line: string | null) => void;
}

export function useRunActions(keyMask: string | null): RunApi {
  const [busy, setBusy] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; code: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const run = useBusyRunner(setBusy);
  return {
    ...useFolder(run, abort),
    ...useGenerate(run, abort, keyMask),
    ...useExport(run, abort),
    ...usePreview(preview, setPreview),
    supported: hasPicker(),
    rootName: getUploadState().rootName,
    busy,
    runNote,
    setRunNote,
  };
}

type Runner = (work: () => Promise<void>) => Promise<void>;

/** One busy flag for the whole tab: a second one could disagree with it. */
function useBusyRunner(setBusy: (value: boolean) => void): Runner {
  return useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      note(`run stopped: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [setBusy]);
}

/** The folder: pick it, remember the handle, rescan. */
function useFolder(run: Runner, abort: { current: AbortController | null }): Pick<RunApi, "chooseRoot" | "rescan" | "cancel"> {
  const chooseRoot = useCallback(() => run(async () => {
    const handle = await pickDirectory();
    if (handle === null) return; // the user cancelled: nothing changes
    await saveHandles(UPLOAD_HANDLE_KEY, { source: handle });
    setUploadState({ root: handle, rootName: handle.name });
    note(`folder opened: ${handle.name}`);
    await scan(handle);
  }), [run]);
  const rescan = useCallback(() => run(async () => {
    const handle = getUploadState().root ?? await restoreRoot();
    if (handle === null) {
      note("no folder yet — press Open folder first");
      return;
    }
    if (!(await ensurePermission(handle))) {
      note("permission for that folder was not granted");
      return;
    }
    setUploadState({ root: handle, rootName: handle.name });
    await scan(handle);
  }), [run]);
  const cancel = useCallback(() => {
    abort.current?.abort();
    note("cancel requested: staged work is discarded, finished packages stay");
  }, [abort]);
  return { chooseRoot, rescan, cancel };
}

/** Metadata generation: one paid request per icon, cancellable in between. */
function useGenerate(run: Runner, abort: { current: AbortController | null }, keyMask: string | null): Pick<RunApi, "generate"> {
  const generate = useCallback((ids: readonly string[]) => run(async () => {
    if (keyMask === null) {
      note("no API key is stored: metadata cannot be generated");
      return;
    }
    const key = await loadApiKey();
    const root = getUploadState().root;
    if (key === null || root === null) return;
    const controller = startRun(abort);
    const state = getUploadState();
    const targets = state.rows.filter((row) => ids.includes(row.id));
    let accepted = 0;
    for (const row of targets) {
      if (controller.signal.aborted) break;
      accepted += await metadataFor(row, root, key, controller);
    }
    note(`metadata run: ${accepted}/${targets.length} validated`);
  }), [run, abort, keyMask]);
  return { generate };
}

/** One icon's request: render, ask, validate, and say exactly what happened. */
async function metadataFor(row: UploadRow, root: DirHandleLike, key: string, controller: AbortController): Promise<number> {
  setProgress([row.id], `metadata: ${row.stem}`);
  const code = await readRowCode(row, root);
  if (code === null) return reportMetadata(row, null, "the approved SVG could not be read");
  const state = getUploadState();
  const result = await generateFor(code, state.settings, {
    provider: state.provider, key, prompt: state.prompt, raster: browserDeps(), signal: controller.signal,
  });
  return reportMetadata(row, result, result.error ?? "the answer did not validate");
}

/** The SVG to send: the row's copy when we have it, otherwise the file. */
async function readRowCode(row: UploadRow, root: DirHandleLike): Promise<string | null> {
  if (row.code !== null) return row.code;
  return (await loadCode(row, root))?.code ?? null;
}

/** Publish what the run produced, then say it in one sentence. */
function reportMetadata(row: UploadRow, result: Awaited<ReturnType<typeof generateFor>> | null, reason: string): number {
  setProgress([row.id], null);
  if (result === null) {
    addWarning(row.id, reason);
    note(`${row.stem}: metadata failed — ${reason}`);
    return 0;
  }
  const record = result.record;
  const check = result.check;
  if (record === null || check === null || !check.ok) {
    addWarning(row.id, reason);
    note(`${row.stem}: metadata failed — ${reason}`);
    return 0;
  }
  setRow(row.id, { metadata: record, metadataCheck: check, warnings: [...row.warnings, ...result.warnings] });
  note(`${row.stem}: ${record.tags.length} tags accepted · ${result.model || "model not reported"} · ${result.requestId ?? "no request id"}`);
  return 1;
}

function useExport(run: Runner, abort: { current: AbortController | null }): Pick<RunApi, "exportRows"> {
  const exportRows = useCallback((ids: readonly string[]) => run(async () => {
    const state = getUploadState();
    if (state.root === null) {
      note("no folder yet — press Open folder first");
      return;
    }
    const controller = startRun(abort);
    const targets = state.rows.filter((row) => ids.includes(row.id));
    setProgress(ids, "exporting");
    const result = await runRows(targets, runContext(state.root, controller, state, note));
    for (const finished of result.finished) {
      if (finished.run === null) {
        addWarning(finished.row.id, finished.error ?? "the export failed");
        continue;
      }
      setRow(finished.row.id, withRecord(finished.row, finished.run.record));
      for (const line of finished.run.warnings) note(`${finished.row.stem}: ${line}`);
    }
    setProgress([], null);
    const by = (status: string): number => result.finished.filter((each) => each.run?.status === status).length;
    note(`export run: ${by("processed")} processed · ${by("partial")} partial · ${result.failed} failed · ${result.cancelled} cancelled`);
  }), [run, abort]);
  return { exportRows };
}

/** The preview dialog and the export folder's location. */
function usePreview(
  preview: { name: string; code: string } | null,
  setPreview: (value: { name: string; code: string } | null) => void,
): Pick<RunApi, "openPreview" | "closePreview" | "preview" | "openExport"> {
  const openPreview = useCallback(async (row: UploadRow) => {
    const root = getUploadState().root;
    if (root === null) return;
    const loaded = row.code !== null ? { code: row.code } : await loadCode(row, root);
    if (loaded === null) {
      note(`${row.stem}: the approved SVG could not be read`);
      return;
    }
    setPreview({ name: row.stem, code: loaded.code });
  }, [setPreview]);
  const closePreview = useCallback(() => setPreview(null), [setPreview]);
  const openExport = useCallback(async (row: UploadRow) => {
    const path = row.dirPath === "" ? "export" : `${row.dirPath}/export`;
    // A page cannot reveal a folder in the OS; the path is what we can hand over.
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    const copied = clipboard === undefined ? false : await clipboard.writeText(path).then(() => true, () => false);
    note(copied ? `export folder path copied: ${path}` : `export folder: ${path}`);
  }, []);
  return { openPreview, closePreview, preview, openExport };
}

function hasPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function restoreRoot(): Promise<DirHandleLike | null> {
  return (await loadHandles(UPLOAD_HANDLE_KEY))?.source ?? null;
}

function startRun(ref: { current: AbortController | null }): AbortController {
  ref.current?.abort();
  const controller = new AbortController();
  ref.current = controller;
  return controller;
}

/** Discovery + the packages already on disk, in one pass. */
async function scan(root: DirHandleLike): Promise<void> {
  const found = await discoverApprovedSources(root);
  const rows: UploadRow[] = [];
  for (const source of found.sources) {
    const row = rowFromSource(source, found.metas.get(source.id) ?? null);
    rows.push(withRecord(row, await loadRecord(row, root)));
  }
  setUploadState({ rows, checked: [], activeId: rows[0]?.id ?? null });
  note(`scanned ${rows.length} approved SVG(s)${found.excluded.length > 0 ? `, ${found.excluded.length} excluded` : ""}`);
}

/** The record wins over a stored draft: it is what a consumer will read. */
function withRecord(row: UploadRow, record: ExportRecord | null): UploadRow {
  return record === null ? row : { ...row, record, metadata: record.metadata, metadataCheck: record.metadataCheck };
}

function setRow(id: string, patch: Partial<UploadRow>): void {
  setUploadState({ rows: getUploadState().rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
}

function addWarning(id: string, line: string): void {
  const row = getUploadState().rows.find((each) => each.id === id);
  if (row !== undefined) setRow(id, { warnings: [...row.warnings, line] });
}

function setProgress(ids: readonly string[], line: string | null): void {
  setUploadState({ rows: getUploadState().rows.map((row) => (ids.includes(row.id) ? { ...row, progress: line } : row)) });
}

export type { MetadataRecord };
