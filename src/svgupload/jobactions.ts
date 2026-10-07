// jobactions.ts — the six things a user can DO with jobs (design §7/§16): name a
// selection, export a selection, retry what failed, cancel what is running, save
// an edited answer, copy it, and reveal an export folder. Split from the hook so
// each file stays small and each action reads as one idea: what it does, what it
// records, and which store it writes.
//
// Two rules are visible in the code below rather than in a comment elsewhere:
//   · a cancel aborts the queue and touches nothing that finished — the packages
//     already published stay published;
//   · an edited answer goes through the SAME validator as a provider answer, so a
//     draft can be saved but never exported.

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { copyFolderText } from "../lib/copypath";
import { editRecord, recordFor, type MetaStore } from "../lib/svgupload/meta";
import type { JobKind } from "../lib/svgupload/rows";
import { ExportQueue } from "./jobctl";
import { exportDirOf } from "./package";
import { getMetaStore, putRecordOnStore } from "./metastore";
import { providerCard } from "./runupload";
import { publishExport, requestNames, type CtxOf, type MarkFn, type SayFn } from "./jobsteps";
import type { JobDeps, UploadJobsInput } from "./useUploadJobs";

/** The mutable pieces every action closes over (one object: one prop list). */
export interface ActionIo {
  deps: JobDeps;
  context: CtxOf;
  mark: MarkFn;
  queue: { current: ExportQueue | null };
  state: { current: UploadJobsInput };
  storeRef: { current: MetaStore };
  setBusyIds: Dispatch<SetStateAction<string[]>>;
  setNote: Dispatch<SetStateAction<string | null>>;
  jobs: Record<string, JobKind>;
}

/** What the actions add to the jobs slice. */
/** What the actions add to the jobs slice. */
export interface JobActions {
  runMetadata: (ids: string[]) => void;
  exportRows: (ids: string[]) => void;
  retryFailed: () => void;
  cancel: () => void;
  saveMeta: (id: string, patch: { title: string; description: string; tags: string[] }) => void;
  copyToClipboard: (text: string) => void;
  openExport: (id: string) => void;
  checkProvider: () => void;
}

/** The three groups, composed here so the hook body is one line per group. */
export function useJobActions(io: ActionIo): JobActions {
  const starters = useJobStarters(io);
  return { ...starters, ...useJobControls(io, starters), ...useMetaEditing(io), ...useFolderActions(io) };
}

/** Starting work: name a selection, then export it. */
function useJobStarters(io: ActionIo): Pick<JobActions, "runMetadata" | "exportRows"> {
  const { deps, context, mark, setNote } = io;
  const runMetadata = useCallback((ids: string[]) => {
    io.setBusyIds((b) => [...new Set([...b, ...ids])]);
    void runNames(ids, { deps, context, mark, say: setNote }).finally(() =>
      io.setBusyIds((b) => b.filter((x) => !ids.includes(x))));
  }, [context, deps, io, mark, setNote]);

  const exportRows = useCallback((ids: string[]) => {
    io.setBusyIds((b) => [...new Set([...b, ...ids])]);
    const q = startQueue({ deps, context, mark, say: setNote });
    io.queue.current = q;
    q.add(ids);
    void q.pump().then(() => {
      io.setBusyIds((b) => b.filter((x) => !ids.includes(x)));
      io.queue.current = null;
    });
  }, [context, deps, io, mark, setNote]);

  return { runMetadata, exportRows };
}

/** Steering work already queued: retry what failed, cancel what is running. */
function useJobControls(io: ActionIo, starters: Pick<JobActions, "exportRows">): Pick<JobActions, "retryFailed" | "cancel"> {
  const { setNote } = io;
  const retryFailed = useCallback(() => {
    const ids = failedIds(io.jobs);
    if (ids.length === 0) { setNote("Nothing to retry — no icon failed."); return; }
    starters.exportRows(ids);
  }, [io, starters, setNote]);

  const cancel = useCallback(() => {
    io.queue.current?.cancel();
    setNote("Cancelled — completed packages were kept.");
  }, [io, setNote]);

  return { retryFailed, cancel };
}

/** Editing AND copying the accepted metadata (the same validator judges both). */
function useMetaEditing(io: ActionIo): Pick<JobActions, "saveMeta" | "copyToClipboard"> {
  const { setNote } = io;
  const saveMeta = useCallback((id: string, patch: { title: string; description: string; tags: string[] }) => {
    const current = getMetaStore();
    const record = recordFor(current, id);
    if (record === null) return;
    const edited = editRecord(record, patch, new Date().toISOString());
    putRecordOnStore(current, edited);
    setNote(edited.status === "accepted"
      ? "Metadata saved — it is embedded on the next export."
      : `Saved as a draft: ${edited.errors[0] ?? "it did not pass the policy"}`);
  }, [setNote]);

  const copyToClipboard = useCallback((text: string) => {
    void navigator.clipboard.writeText(text)
      .then(() => setNote("Copied the metadata to the clipboard."))
      .catch(() => setNote("Could not copy — select the text and copy it manually."));
  }, [setNote]);

  return { saveMeta, copyToClipboard };
}

/** The two things that do not touch a job: reveal the folder, check the model. */
function useFolderActions(io: ActionIo): Pick<JobActions, "openExport" | "checkProvider"> {
  const { deps, setNote } = io;
  const openExport = useCallback((id: string) => {
    const row = io.state.current.rows.find((r) => r.id === id);
    if (row === undefined) return;
    // A browser cannot launch Explorer; it copies the folder path and says so.
    void copyFolderText(io.state.current.rootName, exportDirOf(row.dirPath), (msg) => setNote(msg));
  }, [io, setNote]);

  const checkProvider = useCallback(() => {
    void (async () => {
      const provider = await deps.providerOf();
      const card = providerCard({ config: provider.config, catalog: provider.catalog, model: io.storeRef.current.model });
      setNote(card.choice.ok
        ? `Metadata model: ${card.choice.model} — verified against the provider's list.`
        : card.choice.reason);
    })();
  }, [deps, io, setNote]);

  return { openExport, checkProvider };
}

/** Names one icon at a time, in the order the user selected them. */
async function runNames(ids: string[], io: Pick<ActionIo, "deps" | "context" | "mark"> & { say: SayFn }): Promise<void> {
  for (const id of ids) await requestNames(id, { deps: io.deps, context: io.context, mark: io.mark, say: io.say });
}

/**
 * The bounded queue that runs the exports. Two at a time: every export renders a
 * ~15 MP raster and posts a metadata request, and the exports of two neighbours
 * are independent by design — one icon's failure may not touch another's.
 */
function startQueue(io: Pick<ActionIo, "deps" | "context" | "mark"> & { say: SayFn }): ExportQueue {
  return new ExportQueue({
    concurrency: 2,
    run: async (id, signal) => await publishExport(id, { deps: io.deps, context: io.context, mark: io.mark, say: io.say, signal }),
    onEvent: (event) => { if (event.state === "queued") io.mark(event.id, "queued"); },
  });
}

/** The icons whose last run ended in a way a retry can improve. */
function failedIds(jobs: Record<string, JobKind>): string[] {
  return Object.entries(jobs)
    .filter(([, value]) => value === "failed" || value === "interrupted" || value === "partial")
    .map(([id]) => id);
}

export type { SayFn };
