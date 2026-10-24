import { dropUncertainWaiters } from "./jobqueue";
// Concurrent confirmed SVG runs: bounded admission, per-source exclusion,
// isolated cancellation and finally cleanup. The runner itself stays sequential.
import { acquireResources, availableJob } from "../lib/joblocks";
import { MAIN_PLAN } from "../lib/svgregen";
import { inIdOrder } from "../lib/selectionorder";
import { redact } from "../lib/svgsecret";
import { newRunId } from "./journal";
import { jobStore, parallelLimit, releaseJobRows, sourceKeys, sourcesBusy, type SvgJob, type RunSnapshot } from "./jobstate";
import { jobEvent, syncForeground } from "./jobprogress";
import { runGeneration, message, type RunSummary } from "./runner";
import { withRunLog } from "./runlog";
import { summaryLine } from "./runstate";
import { setQueue, type RunCtx } from "./runcontext";
import type { QueueItem } from "./runqueue";
import { notifyCompletion } from "../ui/completionSound";

/** Start every eligible independent job; synchronous leases precede all awaits. */
export function pumpRuns(c: RunCtx): void {
  const store = jobStore(c.refs);
  store.wake = () => pumpRuns(c);
  while (store.jobs.filter((job) => job.status === "running").length < parallelLimit()) {
    const item = availableJob(c.refs.queue.current, (id) => sourcesBusy(c, [id]));
    if (!item) break;
    const snapshot = store.snapshots.get(item.id);
    store.snapshots.delete(item.id);
    setQueue(c, c.refs.queue.current.filter((q) => q.id !== item.id));
    if (snapshot) launchRun(snapshot, item);
    else c.say("Queued run has no confirmed settings — open its confirmation again", true);
  }
}

function launchRun(snapshot: RunSnapshot, item: QueueItem): void {
  const { c } = snapshot;
  const store = jobStore(c.refs);
  if (!store.jobs.some((job) => job.status === "running")) store.jobs = [];
  const job: SvgJob = { id: newRunId(), label: item.label, ids: item.ids, keys: sourceKeys(c, item.ids),
    controller: new AbortController(), status: "running", progress: null, current: null, outcomes: [], summary: "" };
  if (!acquireResources(store.locks, job.id, job.keys)) return;
  store.jobs.push(job);
  syncForeground(c);
  c.setRowsFn((rows) => rows.map((row) => item.ids.includes(row.source.id) ? { ...row, status: "generating", running: true, error: null } : row));
  void executeRun(snapshot, item, job);
}

async function executeRun(snapshot: RunSnapshot, item: QueueItem, job: SvgJob): Promise<void> {
  const { c, root, key } = snapshot;
  try {
    const summary = await runGeneration({ root, apiKey: key, runId: job.id,
      config: { ...c.m.config, imagesPerRequest: item.regen?.kind === "current-svg" ? item.regen.size : c.m.config.imagesPerRequest }, caps: c.m.caps, params: c.m.params,
      prompt: c.m.prompt, regen: item.regen ?? MAIN_PLAN, promptChoice: item.prompt, regenCodes: item.codes,
      sources: inIdOrder(c.rows, item.ids, (r) => r.source.id).map((r) => r.source), metas: c.refs.metas,
      signal: job.controller.signal, onEvent: withRunLog((event) => jobEvent(c, job, event)) });
    job.outcomes = summary.outcomes;
    job.status = summary.cancelled ? "cancelled" : summary.saved === 0 && summary.problems.length > 0 ? "failed" : "finished";
    job.summary = endLine(summary, job.controller);
    c.say(job.summary, job.status === "failed");
  } catch (error) {
    job.status = job.controller.signal.aborted ? "cancelled" : "failed";
    job.summary = `SVG run stopped: ${redact(message(error), key)}`;
    c.say(job.summary, true);
  } finally {
    finishJob(c, job);
  }
}

function finishJob(c: RunCtx, job: SvgJob): void {
  const owned = job.keys.filter((key) => jobStore(c.refs).locks.get(key) === job.id);
  if (job.status !== "finished") dropUncertainWaiters(c, owned);
  // Aborted/exceptional items not delivered by a terminal event must not stay generating.
  c.setRowsFn((rows) => rows.map((row) => row.running && jobStore(c.refs).locks.get(sourceKeys(c, [row.source.id])[0]) === job.id
    ? { ...row, running: false, status: "unknown", error: "Run ended without a confirmed result — not resent" } : row));
  // Marked terminal already: sync before waking so no new job inherits this controller.
  syncForeground(c);
  releaseJobRows(c.refs, job, job.keys);
  if (job.status !== "cancelled") notifyCompletion(job.id);
}

export function stopSvgRuns(c: RunCtx, id?: string, dropped = 0): void {
  for (const job of jobStore(c.refs).jobs) {
    if (job.status === "running" && (id === undefined || job.id === id)) job.controller.abort({ dropped });
  }
}

function endLine(summary: RunSummary, controller: AbortController): string {
  const dropped = (controller.signal.reason as { dropped?: number } | undefined)?.dropped ?? 0;
  return summaryLine(summary) + (dropped > 0 ? ` · ${dropped} queued batch${dropped === 1 ? "" : "es"} dropped` : "");
}
