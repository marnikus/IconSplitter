// SvgImgInflight.tsx — sent image-edit requests left unknown by a reload.
// The provider may have charged them; retry always returns to confirmation.

import type { ImageRequestEvidence } from "./imgjournal";

export default function SvgImgInflight({ entries, warning, busy, onRetry, onDismiss }: {
  entries: readonly ImageRequestEvidence[];
  warning: boolean;
  busy: boolean;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (busy) return null;
  return <>
    {warning && <p className="svg-warning" data-testid="svg-img-journal-warning">The stored image-request record was unreadable; no request was resent.
      <button type="button" className="svg-btn tiny" onClick={() => onDismiss("corrupt")}>Dismiss</button></p>}
    {entries.map((entry) => <p className="svg-warning" data-testid="svg-img-inflight" key={entry.id}>
      ⚠ {entry.ids.length} AI source(s): {entry.status === "review" ? "the returned preview was lost on reload" : "the provider outcome is unknown"}.
      A request may have incurred cost. Nothing has been resent.
      <button type="button" className="svg-btn tiny" data-testid="svg-img-inflight-retry" onClick={() => onRetry(entry.id)}>Retry via confirmation</button>
      <button type="button" className="svg-btn tiny" data-testid="svg-img-inflight-dismiss" onClick={() => onDismiss(entry.id)}>Dismiss</button>
    </p>)}
  </>;
}
