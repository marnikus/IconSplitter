// SvgQueueBar.tsx — what is waiting for its turn (2026-10-05, RUN-2).
// The batch in flight is shown by the strip; this bar shows the batches the
// user confirmed while it runs, in the order they will be sent, each with the
// frozen plan it will send (sources named, requests, model) and a Remove, plus
// one Clear queue for the lot. It renders nothing while nothing waits.

import type { QueuedBatch } from "./queue";
import type { SvgSource } from "./sources";

export interface SvgQueueBarProps {
  queue: readonly QueuedBatch[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function SvgQueueBar({ queue, onRemove, onClear }: SvgQueueBarProps) {
  if (queue.length === 0) return null;
  return (
    <section className="svg-queue" data-testid="svg-queue" aria-label="Generation queue">
      <span className="svg-queue-title" data-testid="svg-queue-count">
        {queue.length} queued
      </span>
      <ol className="svg-queue-list">
        {queue.map((batch) => (
          <li key={batch.id} className="svg-queue-item" data-testid={`svg-queue-item-${batch.id}`}>
            <span className="svg-queue-names">{namesOf(batch.run.sources)}</span>
            <span className="svg-queue-plan">{batch.label}</span>
            <button type="button" className="svg-btn tiny" data-testid={`svg-queue-remove-${batch.id}`}
              aria-label={`Remove queued batch ${batch.label}`} onClick={() => onRemove(batch.id)}>Remove</button>
          </li>
        ))}
      </ol>
      <button type="button" className="svg-btn tiny" data-testid="svg-queue-clear" onClick={onClear}>Clear queue</button>
    </section>
  );
}

/** Which icons wait: their stems, at most four named, then "+N more". */
function namesOf(sources: readonly SvgSource[]): string {
  const stems = sources.map((s) => s.stem);
  const shown = stems.slice(0, 4).join(", ");
  return stems.length > 4 ? `${shown} +${stems.length - 4} more` : shown;
}
