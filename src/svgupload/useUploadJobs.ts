// useUploadJobs.ts — the slice of the panel that costs money (design §7/§8/§16).
// What lives here:
//   · running ONE metadata request per icon through the real provider transport,
//     with the model verified against the provider's list first (never substituted);
//   · running exports through the bounded queue, so at most two icons export at a
//     time and one metadata request is ever in flight;
//   · the row states the counts read (queued → running → processed/partial/failed)
//     and the cancel that keeps every package already published;
//   · the two dialogs (preview, settings) and the clipboard actions.
// The expensive parts are reached through `deps` (default: the real modules), so
// the DOM tests drive this hook with fakes and no network at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { loadApiKey } from "../svg/keystore";
import { loadCatalog } from "../svg/catalog";
import { loadConfig } from "../svg/promptstore";
import type { DirHandleLike } from "../lib/fs";
import { recordFor, type MetaStore } from "../lib/svgupload/meta";
import type { MetaRecord, MetaText } from "../lib/svgupload/metaprompt";
import type { JobKind, UploadRow } from "../lib/svgupload/rows";
import type { UploadSettings } from "../lib/svgupload/settings";
import type { ExportQueue } from "./jobctl";
import { generateMetadataFor, runExport, type RunContext, type RunOut } from "./runupload";
import { useJobActions } from "./jobactions";
import { getMetaStore, subscribeMetaStore } from "./metastore";
import { getJobStore, rememberJobs, rememberOutcome, setJobStore } from "./jobstore";
import { restoreSpec } from "./uploadlog";
import { log } from "../log/logstore";

/** What a run reports back, whichever kind it was. */
export interface RunReport {
  status: string;
  note: string;
  meta: MetaRecord | null;
}

/** The seams the tests replace; the defaults are the real modules. */
export interface JobDeps {
  /** Names one icon (one paid request) and stores what came back. */
  nameOne: (ctx: RunContext) => Promise<{ record: MetaRecord; meta: MetaText | null; error: string | null }>;
  /** Exports one icon end to end (the whole pipeline). */
  exportOne: (ctx: RunContext) => Promise<RunOut>;
  /** Provider config + key + catalog, read fresh for every run. */
  providerOf: () => Promise<{ config: ReturnType<typeof loadConfig>; apiKey: string; catalog: readonly { id: string }[] | null }>;
}

export const REAL_DEPS: JobDeps = {
  nameOne: (ctx) => generateMetadataFor(ctx),
  exportOne: (ctx) => runExport(ctx),
  providerOf: async () => ({
    config: loadConfig(),
    apiKey: (await loadApiKey()) ?? "",
    catalog: loadCatalog()?.models ?? null,
  }),
};

export interface DialogState {
  kind: "preview" | "settings";
  id: string;
}

export interface UploadJobsInput {
  root: DirHandleLike | null;
  rows: UploadRow[];
  settings: UploadSettings;
  rootName: string;
}

export interface JobsApi {
  meta: Record<string, MetaRecord>;
  jobs: Record<string, JobKind>;
  busyIds: string[];
  note: string | null;
  dialog: DialogState | null;
  dismissNote: () => void;
  openDialog: (kind: DialogState["kind"], id: string) => void;
  closeDialog: () => void;
  runMetadata: (ids: string[]) => void;
  exportRows: (ids: string[]) => void;
  retryFailed: () => void;
  cancel: () => void;
  saveMeta: (id: string, patch: { title: string; description: string; tags: string[] }) => void;
  copyToClipboard: (text: string) => void;
  openExport: (id: string) => void;
  checkProvider: () => void;
}

/**
 * What the LAST session left behind, with the one rule a restart must honour:
 * an unfinished job comes back as `interrupted` (visible, retried only by a
 * click) and never as a job that quietly spends money again. The note and the
 * log line are written here, once, so the panel does not have to remember to.
 */
function restoreFromLastSession(): { states: Record<string, JobKind>; note: string | null } {
  const restored = rememberJobs(getJobStore().states);
  if (Object.keys(restored.states).length > 0) setJobStore(restored);
  if (restored.note !== null) log(restoreSpec(countInterrupted(restored.states)));
  return restored;
}

/** How many of the restored states are the interrupted ones. */
function countInterrupted(states: Record<string, JobKind>): number {
  return Object.values(states).filter((state) => state === "interrupted").length;
}

/**
 * Read ONCE per page load: computed on first use and remembered, so React's
 * StrictMode double-invoke cannot log the restart twice and every mount of the
 * tab sees the same answer. `resetSessionRestore` is the test seam for a scan of
 * storage that happens after this module was imported.
 */
let restoredSession: ReturnType<typeof restoreFromLastSession> | null = null;

function sessionOf(): ReturnType<typeof restoreFromLastSession> {
  restoredSession ??= restoreFromLastSession();
  return restoredSession;
}

/** Test seam: forget the restored session so the next read looks at storage again. */
export function resetSessionRestore(): void {
  restoredSession = null;
}

/**
 * The context one run needs; null when the row cannot be exported at all. Kept
 * out of the hook body: it is the one place a row, a root and a provider config
 * are combined, and that rule deserves its own name.
 */
function useContextOf(deps: JobDeps, state: { current: UploadJobsInput }, storeRef: { current: MetaStore }) {
  return useCallback(async (id: string, signal?: AbortSignal): Promise<RunContext | null> => {
    const { root, rows, settings } = state.current;
    const row = rows.find((r) => r.id === id);
    if (root === null || row === undefined || row.blocked !== null || row.svgPath === null) return null;
    const provider = await deps.providerOf();
    return {
      root, row, settings, metaStore: storeRef.current, record: recordFor(storeRef.current, id),
      config: provider.config, apiKey: provider.apiKey, catalog: provider.catalog, signal,
    };
  }, [deps, state, storeRef]);
}

/** Binds the metadata store to React (RULE 12: one owner, many readers). */
function useMetaStore(): MetaStore {
  const [value, setValue] = useState(getMetaStore);
  useEffect(() => subscribeMetaStore(() => setValue(getMetaStore())), []);
  return value;
}

export function useUploadJobs(input: UploadJobsInput, deps: JobDeps = REAL_DEPS): JobsApi {
  const store = useMetaStore();
  const [jobs, setJobs] = useState<Record<string, JobKind>>(() => sessionOf().states);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(() => sessionOf().note);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const queue = useRef<ExportQueue | null>(null);
  const state = useRef(input);
  state.current = input;
  const storeRef = useRef(store);
  storeRef.current = store;
  const mark = useCallback((id: string, value: JobKind) => {
    rememberOutcome(id, value);
    setJobs((current) => ({ ...current, [id]: value }));
  }, []);
  const context = useContextOf(deps, state, storeRef);
  const actions = useJobActions({ deps, context, mark, queue, state, storeRef, setBusyIds, setNote, jobs });
  return {
    meta: store.records, jobs, busyIds, note, dialog, ...actions,
    dismissNote: () => setNote(null),
    openDialog: (kind, id) => setDialog({ kind, id }),
    closeDialog: () => setDialog(null),
  };
}
