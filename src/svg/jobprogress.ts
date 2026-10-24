import { dropUncertainWaiters } from "./jobqueue";
// Every run owns progress/current. Only the selected foreground run bridges to
// the legacy popup; row events remain functional per-source updates.
import { onRunEvent, type RunSetters } from "./runstate";
import { jobStore, publishJobs, releaseJobRows, sourceKeys, type SvgJob } from "./jobstate";
import { runTotals, chainAdd, NO_CHAIN } from "./runtotals";
import type { RunCtx } from "./runcontext";
import type { RunEvent } from "./runtypes";

export function jobEvent(c: RunCtx, job: SvgJob, event: RunEvent): void {
  if (event.kind === "item-failed" && (event.failure === "stalled" || event.failure === "aborted")) {
    dropUncertainWaiters(c, sourceKeys(c, [event.sourceId]));
  }
  onRunEvent(event, jobSetters(c, job));
  publishJobs(c.refs);
  if (event.kind === "item-saved" || event.kind === "item-failed") {
    releaseJobRows(c.refs, job, sourceKeys(c, [event.sourceId]));
  }
}

function jobSetters(c: RunCtx, job: SvgJob): RunSetters {
  const front = () => jobStore(c.refs).foreground === job.id;
  return {
    setRowsFn: c.setRowsFn,
    setProgress: (p) => { job.progress = p; if (front()) c.setProgress(p); },
    setProgressFn: (fn) => { job.progress = fn(job.progress); if (front()) c.setProgress(job.progress); },
    setCurrent: (id) => { job.current = id; if (front()) c.setCurrent(id); },
  };
}

/** Finished runs never clear the progress or running flag of another process. */
export function syncForeground(c: RunCtx): void {
  const store = jobStore(c.refs);
  const active = store.jobs.filter((job) => job.status === "running");
  const front = foregroundJob(store, active);
  store.foreground = front?.id ?? null;
  c.refs.abort.current = active[0]?.controller ?? null;
  c.dispatch({ type: "running", running: active.length > 0 });
  c.setProgress(front?.progress ?? null);
  c.setCurrent(active.length > 0 ? front?.current ?? null : null);
  const completed = store.jobs.filter((job) => job.status !== "running" && job.id !== front?.id);
  c.dispatch({ type: "chain", chain: completed.reduce((chain, job) => chainAdd(chain, job.outcomes), NO_CHAIN) });
  publishJobs(c.refs);
}

/** All active processes count, not just the foreground request in the popup. */
export function processTotals(jobs: readonly import("./jobstate").JobView[], queue: readonly import("./runqueue").QueueItem[]) {
  const queued = queue.reduce((n, item) => n + item.count, 0);
  return jobs.reduce((total, job) => {
    const counts = runTotals(job.progress, []);
    const left = job.status === "running" ? job.total - counts.done : 0;
    const saved = job.progress?.outcomes.reduce((n, outcome) => n + outcome.saved, 0) ?? 0;
    return { done: total.done + counts.done, left: total.left + left, images: total.images + counts.done + left,
      saved: total.saved + saved, interrupted: total.interrupted || job.status === "cancelled" || job.status === "failed" };
  }, { done: 0, left: queued, images: queued, saved: 0, interrupted: false });
}

/** Keep the selected active job; otherwise show work, then the latest result. */
function foregroundJob(store: ReturnType<typeof jobStore>, active: SvgJob[]): SvgJob | undefined {
  return active.find((job) => job.id === store.foreground) ?? active[0] ?? store.jobs.at(-1);
}
