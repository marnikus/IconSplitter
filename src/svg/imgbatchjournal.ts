// Request evidence and send announcements for one image-edit process.
import { removeImageRequest, saveImageJournal, upsertImageRequest, type ImageRequestEvidence } from "./imgjournal";
import { updateImageProcess } from "./imgprogress";
import type { ImageRegenItem } from "./imgrunner";
import type { CompositeRun } from "./imgbatchrun";

export function markSent(run: CompositeRun, item: ImageRegenItem): void {
  const index = run.prepared.groups.findIndex((_, i) => item.id === `${run.id}-${i}`);
  if (index < 0) return;
  const group = run.prepared.groups[index];
  run.sent.add(index);
  updateImageProcess(run.c.refs, run.id, { request: index + 1, phase: "running" });
  const entry: ImageRequestEvidence = { id: item.id, ids: group.plan.cells.map((c) => c.id), status: "sent",
    at: Date.now(), model: run.prepared.conn.model, provider: run.prepared.conn.name, requestId: null };
  updateJournal(run, upsertImageRequest(run.journal, entry));
  run.c.dispatch({ type: "img-running", ids: entry.ids, on: true });
  run.c.say(`Request ${index + 1}/${run.prepared.groups.length} sent · ${entry.ids.length} icons`);
}

export function markReview(run: CompositeRun, id: string, requestId: string | null): void {
  const current = run.journal.find((entry) => entry.id === id);
  if (current) updateJournal(run, upsertImageRequest(run.journal, { ...current, status: "review", requestId }));
}

export function clearJournal(run: CompositeRun, id: string): void {
  updateJournal(run, removeImageRequest(run.journal, id));
}

function updateJournal(run: CompositeRun, entries: ImageRequestEvidence[]): void {
  run.journal = entries;
  saveImageJournal(entries);
  run.c.dispatch({ type: "img-journal", entries });
}
