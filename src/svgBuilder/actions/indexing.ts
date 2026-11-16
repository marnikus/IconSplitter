// actions/indexing.ts — "Icons indexing": one run at a time over every approved
// icon in the scanned root; progress in `model.indexing`, cancellable between
// icons, honest result line (indexed / skipped / failed / cancelled).
import { runIndexing, type IndexProgress } from "../indexer/runIndexing";
import { indexRuntime } from "../indexer/runtime";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type IndexingActions = Pick<BuilderActions, "startIndexing" | "cancelIndexing">;

export function indexingActions(get: () => BuilderActionContext): IndexingActions {
  let controller: AbortController | null = null;
  return {
    startIndexing: () => {
      if (controller !== null) return;
      controller = new AbortController();
      void run(get, controller.signal).finally(() => { controller = null; });
    },
    cancelIndexing: () => controller?.abort(),
  };
}

async function run(get: () => BuilderActionContext, signal: AbortSignal): Promise<void> {
  const ctx = get();
  const root = ctx.model.root;
  const repo = ctx.repository;
  if (root === null || repo === null || ctx.assets.length === 0) return ctx.say("Open a folder with approved SVGs first", true);
  ctx.dispatch({ indexing: { phase: "models", done: 0, total: 0, failed: 0, model: null } });
  try {
    const out = await runIndexing({ root, assets: ctx.assets, index: ctx.index, readSvg: (id) => repo.readSvg(id), signal,
      onProgress: (p: IndexProgress) => get().dispatch({ indexing: p }) }, indexRuntime());
    const discovery = get().model.discovery;
    if (discovery !== null) get().dispatch({ discovery: { ...discovery, index: out.index } });
    get().say(summary(out), out.failed > 0);
  } catch (error) {
    get().say(`Icons indexing failed — ${error instanceof Error ? error.message : "unknown error"}`, true);
  } finally {
    get().dispatch({ indexing: null });
  }
}

function summary(o: { indexed: number; skipped: number; failed: number; cancelled: boolean }): string {
  const head = o.cancelled ? "Icons indexing cancelled" : "Icons indexing done";
  return `${head} — ${o.indexed} indexed · ${o.skipped} already up to date${o.failed > 0 ? ` · ${o.failed} failed` : ""}`;
}
