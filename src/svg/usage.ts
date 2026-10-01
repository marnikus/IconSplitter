// usage.ts — deduplicate the per-source copies of shared Requesty batch usage.
// Provider-returned fields stay authoritative; missing cost is never estimated.

import type { SvgSourceRow, SvgUsage } from "./types";

interface SvgUsageSummary {
  requestCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  actualCostUsd: number | null;
  unpricedRequests: number;
  unknownRequests: number;
}

export function summarizeSvgUsage(rows: SvgSourceRow[]): SvgUsageSummary {
  const unique = new Map<string, SvgUsage & { status: string }>();
  rows.flatMap((row) => row.requests).forEach((request) => {
    if (!unique.has(request.clientRequestId)) unique.set(request.clientRequestId, { ...request.usage, status: request.status });
  });
  return sumUsage([...unique.values()]);
}

function sumUsage(values: Array<SvgUsage & { status: string }>): SvgUsageSummary {
  const input = sumField(values, "inputTokens");
  const output = sumField(values, "outputTokens");
  const total = sumField(values, "totalTokens");
  const costs = values.map((item) => item.actualCostUsd).filter((value): value is number => value !== null);
  return {
    requestCount: values.length, inputTokens: input, outputTokens: output, totalTokens: total,
    actualCostUsd: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null,
    unpricedRequests: values.filter((item) => item.actualCostUsd === null).length,
    unknownRequests: values.filter((item) => item.status === "unknown" || item.status === "in-progress").length,
  };
}

function sumField(values: Array<SvgUsage & { status: string }>, field: "inputTokens" | "outputTokens" | "totalTokens"): number | null {
  if (values.some((item) => item[field] === null)) return values.length ? null : 0;
  return values.reduce((sum, item) => sum + (item[field] ?? 0), 0);
}
