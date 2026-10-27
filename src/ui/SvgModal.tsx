// SVG-to-upload's modal DOM. Content/confirmation policy stays with the caller.
import type { KeyboardEventHandler, ReactNode } from "react";
export default function SvgModal(p: { titleId: string; onDismiss: () => void; header: ReactNode; children: ReactNode; backdropTestid?: string; onKeyDown?: KeyboardEventHandler<HTMLDivElement> }) {
  return <div className="svg-backdrop" data-testid={p.backdropTestid} onClick={p.onDismiss} onKeyDown={p.onKeyDown}>
    <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby={p.titleId} onClick={e => e.stopPropagation()}>
      {p.header}<div className="svg-modal-body">{p.children}</div>
    </section>
  </div>;
}
export function ModalHeader(p: { titleId: string; title: ReactNode; onDismiss: () => void; cancelTestid?: string }) {
  return <header className="svg-modal-head"><h2 id={p.titleId}>{p.title}</h2>
    <button type="button" className="svg-btn tiny" data-testid={p.cancelTestid} onClick={p.onDismiss}>Cancel</button>
  </header>;
}
