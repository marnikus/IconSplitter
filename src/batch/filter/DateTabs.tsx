// DateTabs.tsx — date mode tabs for Batch filter

import { monthKey, type BatchFilter } from "../../lib/batchfilter";
import SegButton from "../../selectionv2/SegButton";
import type { BatchFilterGridProps } from "../BatchFilterGrid";

const RANGE_ALL = { mode: "custom", from: 0, to: Number.MAX_SAFE_INTEGER } as const;

export default function DateTabs({ p }: { p: BatchFilterGridProps }) {
  const mode = p.filter.date.mode;
  const set = (date: BatchFilter["date"]) => p.setFilter({ ...p.filter, date });
  return (
    <div className="v2-date-tabs" role="group" aria-label="Date filter">
      <SegButton active={mode === "all"} label="All" testid="batch-date-all" onClick={() => set({ mode: "all" })} />
      <SegButton active={mode === "month"} label="Month" testid="batch-date-month" onClick={() => set({ mode: "month", month: monthKey(Date.now()) })} />
      <SegButton active={mode === "custom"} label="Range" testid="batch-date-range" onClick={() => set(RANGE_ALL)} />
    </div>
  );
}
