// jobjournal.ts — the durable side of the attempt journal (report §5/R10):
// reads and writes `<pair>/export/attempts.json` through the same DirHandleLike
// the package protocol uses, and traces a run's stage transitions into it. The
// journal lives BESIDE the pointer (inside `export/`), so it can never be
// mistaken for a committed output and never enters a generation.
//
// Nothing here is advisory-only: the trace awaits every write, so a crash
// between two stages still leaves the last stage on disk.

import type { DirHandleLike } from "../lib/fs";
import { ensureDirPath, probePath, tryGetFile, writeFileOverwrite } from "../lib/fs";
import {
  parseJournal, startRun, settle, withAttempt, withDraft, JOURNAL_STAGES,
  type JobJournal, type JournalStage, type SettledState,
} from "../lib/upjournal";
import type { IconMetadata } from "../lib/upmeta";
import type { MetadataProvenance } from "../lib/upexport";
import type { JobRequest, JobResult, JobState, RunnerDeps } from "./runner";

/** Where a pair's journal lives, relative to the pair directory. */
export const JOURNAL_PATH = "export/attempts.json";

export interface JournalStore {
  load(pairDirPath: string): Promise<JobJournal | null>;
  save(pairDirPath: string, journal: JobJournal): Promise<boolean>;
}

/** The real store: tolerant read, overwrite write, no throw on either. */
export function makeJournalStore(root: DirHandleLike): JournalStore {
  return {
    load: (dirPath) => loadJournal(root, dirPath),
    save: async (dirPath, journal) => {
      try {
        const dir = await ensureDirPath(root, dirPath === "" ? "export" : `${dirPath}/export`);
        await writeFileOverwrite(dir, "attempts.json", new Blob([JSON.stringify(journal)]));
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function loadJournal(root: DirHandleLike, pairDirPath: string): Promise<JobJournal | null> {
  try {
    // Read-only lookup: scanning must never create an export folder.
    const dir = await probePath(root, pairDirPath === "" ? "export" : `${pairDirPath}/export`);
    if (dir === null) return null;
    const file = await tryGetFile(dir, "attempts.json");
    if (file === null) return null;
    return parseJournal(await (await file.getFile()).text());
  } catch {
    return null;
  }
}

/** What a run reports back to its journal; the trace owns the writes. */
export interface JournalTrace {
  begin(): Promise<void>;
  stage(state: JobState): void;
  accepted(meta: IconMetadata, provenance: MetadataProvenance): void;
  finish(result: JobResult): Promise<void>;
}

/** Terminal job states and the journal states they settle into. */
const SETTLED: Partial<Record<JobState, SettledState>> = {
  processed: "processed", partial: "partial", failed: "failed", cancelled: "cancelled",
};

export function jobJournal(store: JournalStore, req: JobRequest, now: () => string): JournalTrace {
  let journal: JobJournal | null = null;
  const flush = async (): Promise<void> => {
    if (journal !== null) await store.save(req.row.dirPath, journal);
  };
  return {
    begin: async () => {
      journal = startRun(await store.load(req.row.dirPath), req.row.id, { relPath: req.row.svgRelPath, version: req.row.version }, now());
      await flush();
    },
    stage: (state) => {
      if (journal === null || !isStage(state)) return;
      journal = withAttempt(journal, { stage: state, outcome: "started", detail: null, at: now() });
      void flush();
    },
    accepted: (meta, provenance) => {
      if (journal === null) return;
      journal = withDraft(journal, meta, provenance, now());
      void flush();
    },
    finish: async (result) => {
      if (journal === null) return;
      const settled = SETTLED[result.ok ? "processed" : result.state];
      if (settled !== undefined) journal = settle(journal, settled, now(), result.ok ? null : result.error);
      await flush();
    },
  };
}

function isStage(state: JobState): state is JournalStage {
  return (JOURNAL_STAGES as readonly string[]).includes(state);
}

/** The runner's deps with the journal folded in — one place, one wrapper. */
export function tracedDeps(deps: RunnerDeps, trace: JournalTrace): RunnerDeps {
  return {
    ...deps,
    onState: (id, state, detail) => {
      trace.stage(state);
      deps.onState?.(id, state, detail);
    },
    onMetadata: (id, meta, provenance) => {
      trace.accepted(meta, provenance);
      return deps.onMetadata?.(id, meta, provenance);
    },
  };
}
