// BatchPreviewBar.tsx — the preview cluster beside "Split selected" (design D9/RULE 5).
// Start, the live counter, and one way to stop. No busy overlay: a preview must not
// block the scrolling that drives it.

import type { Progress } from "../../lib/previewqueue";

export interface BatchPreviewBarProps {
  selected: number;
  running: boolean;
  open: boolean;
  progress: Progress;
  onStart: () => void;
  onStop: () => void;
}

export default function BatchPreviewBar(p: BatchPreviewBarProps) {
  return (
    <>
      <button
        type="button"
        className="svg-btn"
        data-testid="batch-preview"
        disabled={p.selected === 0 || p.running}
        title="Show every split these settings would produce, without writing anything"
        onClick={p.onStart}
      >
        👁 Preview splits ({p.selected})
      </button>
      {p.open && <Counter progress={p.progress} />}
      {p.running && (
        <button type="button" className="svg-btn" data-testid="batch-preview-stop" onClick={p.onStop}>
          ✕ Stop preview
        </button>
      )}
    </>
  );
}

function Counter({ progress }: { progress: Progress }) {
  return (
    <span className="svg-scope-copy" data-testid="batch-preview-progress" aria-live="polite">
      Previewed {progress.done}/{progress.total} rows · {progress.icons} icons
    </span>
  );
}
