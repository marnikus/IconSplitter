// Separate process controls below the list. The main popup follows one run;
// these records never combine another run's request numbers or Stop controller.
import { useState } from "react";
import { jobStore, MAX_SVG_RUNS, parallelLimit, setParallelLimit } from "./jobstate";
import { useJobViews } from "./useJobViews";
import { runTotals, totalsLine } from "./runtotals";
import type { SvgRefs } from "./types";
import CompletionSoundControl from "../ui/CompletionSoundControl";

export default function SvgRuns({ refs, onStop }: { refs: SvgRefs; onStop: (id: string) => void }) {
  const store = jobStore(refs);
  const [limit, setLimit] = useState(parallelLimit);
  const jobs = useJobViews(refs);
  return <section className="svg-run-record" data-testid="svg-parallel-runs" aria-label="Parallel processes">
    <h3>Processes · up to {MAX_SVG_RUNS} SVG runs + one image-edit run</h3>
    <label>Parallel SVG runs <select data-testid="svg-parallel-limit" value={limit} onChange={(e) => {
      const n = Number(e.target.value); setLimit(n); setParallelLimit(n); store.wake();
    }}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
    <CompletionSoundControl />
    {jobs.map((job) => <div key={job.id} className="svg-provider-foot" data-testid={`svg-run-${job.id}`}>
      <strong>{job.label}</strong><span>{job.status}</span>
      <span>{job.progress ? totalsLine(runTotals(job.progress, []), job.status === "running") : `${job.total} source(s)`}</span>
      {job.status === "running" ? <button type="button" className="svg-btn" data-testid={`svg-run-stop-${job.id}`}
        data-run-id={job.id} onClick={() => onStop(job.id)}>Stop this run</button> : <span>{job.summary}</span>}
    </div>)}
  </section>;
}
