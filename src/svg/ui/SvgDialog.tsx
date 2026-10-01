// ui/SvgDialog.tsx — accessible SVG modal shell with Escape, focus entry and a
// small tab loop; each workflow dialog supplies only its domain content.

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";

export default function SvgDialog({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const id = `svg-dialog-${useId().replace(/:/g, "")}`;
  const ref = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => focusDialog(ref.current, () => closeRef.current()), []);
  return (
    <div className="svg-modal-backdrop" onMouseDown={(event) => closeBackdrop(event, onClose)}>
      <section ref={ref} className={`svg-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true"
        aria-labelledby={id} tabIndex={-1} onKeyDown={(event) => trapTab(event, ref.current)}>
        <header><h2 id={id}>{title}</h2><button type="button" className="svg-btn" onClick={onClose} aria-label={`Close ${title}`}>Close</button></header>
        <div className="svg-modal-body">{children}</div>
      </section>
    </div>
  );
}

function focusDialog(dialog: HTMLElement | null, onClose: () => void): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusable = dialog?.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)");
  (focusable ?? dialog)?.focus();
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
  window.addEventListener("keydown", escape);
  return () => { window.removeEventListener("keydown", escape); if (previous?.isConnected) previous.focus(); };
}

function closeBackdrop(event: MouseEvent<HTMLDivElement>, onClose: () => void): void {
  if (event.target === event.currentTarget) onClose();
}

function trapTab(event: ReactKeyboardEvent<HTMLElement>, dialog: HTMLElement | null): void {
  if (event.key !== "Tab" || !dialog) return;
  const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)")];
  const first = controls[0]; const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
