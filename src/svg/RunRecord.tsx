// RunRecord.tsx — the run's record, placed BELOW the source list (keep-alive D6).
// Why below: the contact sheet and the queue grow while a run works, and a block
// above the list pushed the header and the first rows down with every request.
// The live counts live in the bulk bar and the run popup; this block is the
// record of what was sent, what it cost and what waits.

import SvgBatchStrip from "./SvgBatchStrip";
import SvgQueue from "./SvgQueue";
import type { QueueItem, RunProgress } from "./types";

export interface RunRecordProps {
  progress: RunProgress | null;
  running: boolean;
  queue: QueueItem[];
  onCancel: () => void;
  onDrop: (itemId: string) => void;
}

export default function RunRecord({ progress, running, queue, onCancel, onDrop }: RunRecordProps) {
  if (progress === null && queue.length === 0) return null;
  return (
    <div className="svg-run-record" data-testid="svg-run-record">
      {progress !== null && <SvgBatchStrip progress={progress} running={running} onCancel={onCancel} />}
      <SvgQueue queue={queue} onDrop={onDrop} />
    </div>
  );
}
