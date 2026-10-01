// SvgBatchStrip.tsx — the live run strip (prompt §3/§14/§17): the contact sheet
// the request in flight was built from, the request's place in the run, and one
// line per finished request with ITS status, tokens and cost — so a partial
// failure can be traced to a single request. The composites live in memory
// only and are never written into the SVG output folder. The strip stays after
// a run ends (that record is the answer to "what did this cost, what failed"),
// and Cancel only exists while something is actually in flight.

import { costLabel, fmtTokens } from "../lib/svgusage";
import type { BatchOutcome } from "../lib/svgbatch";
import type { RunProgress } from "./types";

export interface SvgBatchStripProps {
  progress: RunProgress;
  running: boolean;
  onCancel: () => void;
}

export default function SvgBatchStrip({ progress, running, onCancel }: SvgBatchStripProps) {
  return (
    <section className="svg-batch" data-testid="svg-batch" aria-label="Request progress">
      <img className="svg-batch-img" data-testid="svg-batch-composite" src={progress.composite}
        alt={`Contact sheet of request ${progress.index}: ${progress.count} images in a ${progress.cols} by ${progress.rows} grid`} />
      <div className="svg-batch-meta">
        <strong data-testid="svg-batch-id">{progress.batchId}</strong>
        <span data-testid="svg-batch-grid">
          request {progress.index} of {progress.batches} · {progress.cols}×{progress.rows} grid · {progress.count} image(s)
        </span>
        <span data-testid="svg-batch-counts">{progress.saved} saved · {progress.failed} failed · {progress.missing} missing</span>
        <span className="svg-masked">hash {progress.hash.slice(0, 12)}</span>
      </div>
      <Outcomes outcomes={progress.outcomes} />
      {running && <button type="button" className="svg-btn" data-testid="svg-batch-cancel" onClick={onCancel}>Cancel</button>}
    </section>
  );
}

/** One line per finished request: its own counts, tokens and cost. */
function Outcomes({ outcomes }: { outcomes: BatchOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <ul className="svg-batch-list" data-testid="svg-batch-reports">
      {outcomes.map((o) => <li key={o.id} data-testid={`svg-batch-report-${o.index}`} className={o.status}>{line(o)}</li>)}
    </ul>
  );
}

function line(o: BatchOutcome): string {
  const counts = [`${o.saved} saved`];
  if (o.failed > 0) counts.push(`${o.failed} failed`);
  if (o.missing > 0) counts.push(`${o.missing} missing`);
  return `#${o.index} ${o.id} · ${counts.join(" · ")} · ${fmtTokens(o.usage.total)} tokens · ${costLabel(o.cost)}`;
}
