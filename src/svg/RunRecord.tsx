// RunRecord.tsx — the run's own record: the live batch strip and the queued
// batches, rendered BELOW the source list (2026-10-08, finding 4). Anything
// that appears or grows while a run is in flight must sit under the list,
// never above it — otherwise every landing SVG pushes the list down and the
// user loses the header they were reading.

import SvgBatchStrip from "./SvgBatchStrip";
import SvgQueue from "./SvgQueue";
import type { QueueItem } from "./runqueue";
import type { RunProgress } from "./types";

interface Props {
  progress: RunProgress | null;
  running: boolean;
  queue: QueueItem[];
  onCancel: () => void;
  onDrop: (itemId: string) => void;
}

export default function RunRecord({ progress, running, queue, onCancel, onDrop }: Props) {
  if (progress === null && queue.length === 0) return null;
  return (
    <section className="svg-run-record" data-testid="svg-run-record" aria-label="Run">
      {progress !== null && <SvgBatchStrip progress={progress} running={running} onCancel={onCancel} />}
      <SvgQueue queue={queue} onDrop={onDrop} />
    </section>
  );
}
