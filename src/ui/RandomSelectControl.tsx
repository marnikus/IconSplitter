// RandomSelectControl.tsx — shared "Select random" button + integer count for
// the upload tabs' bulk bars (2026-11-08). The pool is the checked items when
// there are any, else every listed item; the draw caps at the pool size and is
// one undoable selection step owned by the tab.

import { useState } from "react";
import { normalizeRandomCount, RANDOM_SELECT_MIN } from "../lib/randomselect";
import DraftNumberInput from "./DraftNumberInput";

export interface RandomSelectControlProps {
  prefix: string;
  checkedCount: number;
  totalCount: number;
  onSelect: (count: number) => void;
}

export default function RandomSelectControl({ prefix, checkedCount, totalCount, onSelect }: RandomSelectControlProps) {
  const [count, setCount] = useState(RANDOM_SELECT_MIN);
  const pool = checkedCount > 0 ? checkedCount : totalCount;
  const scope = checkedCount > 0 ? `from ${pool} selected` : `from all ${pool}`;
  return (
    <span className="svg-toolbar" role="group" aria-label="Select random items" style={{ gap: 6 }}>
      <DraftNumberInput value={count} onCommit={(v) => setCount(normalizeRandomCount(v))}
        testid={`${prefix}-random-count`} label="Number of items to select at random"
        min={RANDOM_SELECT_MIN} max={Number.MAX_SAFE_INTEGER} step={1} />
      <button type="button" className="svg-btn" data-testid={`${prefix}-select-random`}
        disabled={pool === 0} onClick={() => onSelect(count)}
        title="Replace the selection with this many random items: only checked items when some are checked, otherwise the whole list (including hidden rows). A count above the pool draws the whole pool. One undo step.">
        🎲 Select random
      </button>
      <span className="svg-scope-copy" data-testid={`${prefix}-random-scope`}>{scope}</span>
    </span>
  );
}
