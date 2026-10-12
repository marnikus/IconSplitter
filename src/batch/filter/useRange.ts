// useRange.ts — range handling for Batch filter

import type { BatchFilter } from "../../lib/batchfilter";
import type { BatchFilterGridProps } from "../BatchFilterGrid";

export interface Range {
  from: string;
  to: string;
}

export function toMs(value: string, fallback: number): number {
  if (!value) return fallback;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? fallback : t;
}

export function applyRange(p: BatchFilterGridProps, r: Range): void {
  const from = toMs(r.from, 0);
  const to = toMs(r.to, Number.MAX_SAFE_INTEGER);
  p.setFilter({ ...p.filter, date: { mode: "custom", from, to } });
}

export function monthValue(f: BatchFilter): string {
  return f.date.mode === "month" ? f.date.month : "";
}
