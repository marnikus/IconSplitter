// SvgQueue.tsx — the batches waiting for their turn (I-53). Why it is not a
// row status: a queued batch has changed nothing on disk, so the list stays
// about files and this strip is about SCHEDULING. It names each waiting batch,
// says what it will cost in requests, that it starts by itself, and lets the
// user drop one before it starts — the run in flight is never touched.

import type { QueueItem } from "./types";

export interface SvgQueueProps {
  queue: QueueItem[];
  onDrop: (itemId: string) => void;
}

export default function SvgQueue({ queue, onDrop }: SvgQueueProps) {
  if (queue.length === 0) return null;
  return (
    <section className="svg-queue" data-testid="svg-queue" aria-label="Queued batches">
      <p className="svg-queue-head" data-testid="svg-queue-count">
        {queue.length} queued — {queue.length === 1 ? "it starts" : "they start"} as soon as the run in flight ends.
        Adding more never interrupts it.
      </p>
      <ol className="svg-queue-list">
        {queue.map((item, i) => (
          <li key={item.id} className="svg-queue-line" data-testid={`svg-queue-line-${i + 1}`}>
            <span className="svg-queue-what">#{i + 1} · {item.label} · {item.count} image{item.count === 1 ? "" : "s"} · {item.requests} request{item.requests === 1 ? "" : "s"}</span>
            <button type="button" className="svg-btn tiny" data-testid={`svg-queue-drop-${i + 1}`}
              title="Drop this queued batch" onClick={() => onDrop(item.id)}>× Drop</button>
          </li>
        ))}
      </ol>
    </section>
  );
}
