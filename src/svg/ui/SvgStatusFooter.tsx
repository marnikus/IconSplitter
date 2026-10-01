// ui/SvgStatusFooter.tsx — honest indexing, run, error and provider-returned
// usage report. Shared-batch totals are deduplicated and never apportioned.

import type { RunBatchResult } from "../run/process";
import type { SvgSourceRow } from "../types";
import { summarizeSvgUsage } from "../usage";

export default function SvgStatusFooter({ rows, indexing, unreadable, message, results }: {
  rows: SvgSourceRow[]; indexing: boolean; unreadable: number; message: string | null; results: RunBatchResult[];
}) {
  const usage = summarizeSvgUsage(rows);
  return (
    <footer className="svg-status-footer">
      <div className="svg-status-left">
        <span>{indexing ? "Indexing approved sources…" : "Approved-source index ready"}</span>
        <span>{rows.length} approved AI images · recursive</span>
        {unreadable > 0 && <span className="svg-warning-copy">{unreadable} unreadable source(s)</span>}
        {message && <span role="status" aria-live="polite">{message}</span>}
      </div>
      <UsageReport usage={usage} />
      {results.some(hasIssue) && <ResultIssues results={results} />}
    </footer>
  );
}

function UsageReport({ usage }: { usage: ReturnType<typeof summarizeSvgUsage> }) {
  return (
    <div className="svg-usage-summary" aria-label="Requesty usage totals">
      <span>{usage.requestCount} unique request{usage.requestCount === 1 ? "" : "s"}</span>
      <span>{formatTokens(usage.totalTokens)} total tokens</span>
      <strong>{formatCost(usage.actualCostUsd)} Requesty-reported actual</strong>
      {usage.unpricedRequests > 0 && <small>{usage.unpricedRequests} request(s) had no cost field</small>}
      {usage.unknownRequests > 0 && <small className="svg-warning-copy">{usage.unknownRequests} request outcome(s) unknown</small>}
    </div>
  );
}

function ResultIssues({ results }: { results: RunBatchResult[] }) {
  return (
    <details className="svg-result-issues">
      <summary>Batch details ({results.length})</summary>
      {results.map((result) => <BatchResult key={result.batchId} result={result} />)}
    </details>
  );
}

function BatchResult({ result }: { result: RunBatchResult }) {
  return (
    <div className="svg-result-line">
      <strong>{result.state} · {result.summary.successful} saved · {result.summary.missing} missing · {result.summary.invalid} invalid · {result.summary.unknown} unknown</strong>
      {result.safeError && <span>{result.safeError}</span>}
      {result.warning && <span>{result.warning}</span>}
      {result.sidecarFailures > 0 && <span>{result.sidecarFailures} sidecar update(s) need recovery.</span>}
    </div>
  );
}

function hasIssue(result: RunBatchResult): boolean {
  return result.state !== "complete" || Boolean(result.warning) || result.sidecarFailures > 0;
}

function formatTokens(value: number | null): string {
  return value === null ? "partly unavailable" : value.toLocaleString();
}

function formatCost(value: number | null): string {
  return value === null ? "Not reported" : `$${value.toFixed(5)}`;
}
