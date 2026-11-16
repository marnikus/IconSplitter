// A pre-existing queued retry is not consent to resend an uncertain request.
// Remove affected confirmations with an explanation; disjoint jobs stay queued.
import { jobStore, sourceKeys } from "./jobstate";
import { setQueue, type RunCtx } from "./runcontext";

export function dropUncertainWaiters(c: RunCtx, keys: readonly string[]): void {
  const affected = c.refs.queue.current.filter((item) => sourceKeys(c, item.ids).some((key) => keys.includes(key)));
  if (affected.length === 0) return;
  const removed = new Set(affected.map((item) => item.id));
  const store = jobStore(c.refs);
  for (const id of removed) store.snapshots.delete(id);
  setQueue(c, c.refs.queue.current.filter((item) => !removed.has(item.id)));
  c.say(`${removed.size} queued batch(es) dropped: a source outcome is unknown or stopped — review and confirm again before retrying`, true);
}
