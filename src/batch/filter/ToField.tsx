// ToField.tsx — to date input for Batch filter

import Field from "./Field";
import { applyRange, type Range } from "./useRange";
import type { BatchFilterGridProps } from "../BatchFilterGrid";

interface Props {
  p: BatchFilterGridProps;
  range: Range;
  setRange: (r: Range) => void;
}

export default function ToField({ p, range, setRange }: Props) {
  const off = p.filter.date.mode !== "custom";
  return (
    <Field label="To">
      <input
        className="v2-input"
        data-testid="batch-to"
        type="datetime-local"
        disabled={off}
        aria-label="Range to"
        value={range.to}
        onChange={(e) => {
          const next = { ...range, to: e.target.value };
          setRange(next);
          applyRange(p, next);
        }}
      />
    </Field>
  );
}
