// exportmodal.tsx — the ONE export-settings popup (2026-11-19). The SVG to
// upload dialog and the sheet builder's Export settings render this exact
// shell: the same backdrop, the same modal card, the same sticky head with its
// Close button, the same Escape and backdrop dismissal. "Export settings" on
// the builder therefore opens where — and how — the upload's settings open,
// instead of a builder-only look; only the rows inside differ, and those are
// the shared sheet (ui/exportsheet.tsx) already.
import { useEffect, type ReactNode } from "react";

export interface ExportModalProps {
  /** The head's words (the upload dialog adds its scope). */
  title: string;
  /** Id the head <h2> carries, for `aria-labelledby` of the host dialog. */
  titleId: string;
  /** data-testid of the card and of its backdrop. */
  testid: string;
  backdropTestid: string;
  /** data-testid of the Close button. */
  closeTestid: string;
  /** Extra backdrop class, for a host that stacks above its own chrome. */
  backdropClass?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function ExportModal(p: ExportModalProps) {
  useEscape(p.onClose);
  const backdrop = ["svg-backdrop", p.backdropClass ?? ""].join(" ").trim();
  return (
    <div className={backdrop} data-testid={p.backdropTestid} onClick={p.onClose}>
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby={p.titleId}
        data-testid={p.testid} onClick={(e) => e.stopPropagation()}>
        <header className="svg-modal-head">
          <h2 id={p.titleId}>{p.title}</h2>
          <button type="button" className="svg-btn tiny" data-testid={p.closeTestid} onClick={p.onClose}>Close</button>
        </header>
        <div className="svg-modal-body">{p.children}</div>
      </section>
    </div>
  );
}

/** Escape closes the popup, like the panel's other dialogs. */
function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}
