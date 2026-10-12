// FromField.tsx — from date input for Batch filter

import Field from "./Field";
import { monthKey } from "../../lib/batchfilter";
import { applyRange, monthValue, type Range } from "./useRange";
import type { BatchFilterGridProps } from "../BatchFilterGrid";

interface Props {
  p: BatchFilterGridProps;
  range: Range;
  setRange: (r: Range) => void;
}

export default function FromField({ p, range, setRange }: Props) {
  const month = p.filter.date.mode === "month";
  return (
    <Field label={month ? "Month" : "From"}>
      <input
        className="v2-input"
        data-testid="batch-from"
        type={month ? "month" : "datetime-local"}
        disabled={p.filter.date.mode === "all"}
        aria-label={month ? "Filter month" : "Range from"}
        value={month ? monthValue(p.filter) : range.from}
        onChange={(e) => {
          if (month) return p.setFilter({ ...p.filter, date: { mode: "month", month: e.target.value || monthKey(Date.now()) } });
          const next = { ...range, from: e.target.value };
          setRange(next);
          applyRange(p, next);
        }}
      />
    </Field>
  );
}
