// PreviewStrip.tsx — one row's preview strip (design D7, RULE 4/21).
// Subscribes to its own row state, so a 1000-row session re-renders only the rows
// that actually changed. Every state has words: queued, reading, the icon count,
// the cap it applied, why it is empty, and what failed — never a blank square.

import { memo, useSyncExternalStore } from "react";
import { PENDING, type RowPreview, type RowStates } from "../../lib/previewstate";
import type { PreviewableRow } from "./useSplitPreview";

export interface PreviewStripProps {
  row: PreviewableRow;
  states: RowStates;
}

function PreviewStrip({ row, states }: PreviewStripProps) {
  const p = useSyncExternalStore(
    (cb) => states.subscribe(row.relPath, cb),
    () => states.get(row.relPath),
    () => PENDING,
  );
  return (
    <div className="batch-preview-strip" data-testid={`batch-preview-strip-${row.relPath}`} data-state={p.state}>
      {p.urls.map((url, i) => (
        <img
          key={url}
          data-testid={i === 0 ? `batch-preview-img-${row.relPath}` : undefined}
          src={url}
          alt={`Preview of ${p.count} icons from ${row.name}`}
          decoding="async"
          className="batch-preview-thumb"
        />
      ))}
      <span className="batch-preview-count" data-testid={`batch-preview-count-${row.relPath}`}>
        {wordsFor(p)}
      </span>
    </div>
  );
}

/** Every state says what it is (RULE 4: no silent gaps, no silent caps). */
export function wordsFor(p: RowPreview): string {
  if (p.message) return p.message;
  if (p.state === "pending") return "Queued";
  if (p.state === "reading") return "Reading…";
  return p.state;
}

export default memo(PreviewStrip);
