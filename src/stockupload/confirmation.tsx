// Reuse the SVG dialog layout for local writes / native launch confirmation.
import { useEffect, useSyncExternalStore, type KeyboardEvent } from "react";
interface Confirmation { title: string; message: string; resolve: (accepted: boolean) => void; opener: HTMLElement | null }
let pending: Confirmation | null = null;
const listeners = new Set<() => void>();
const snapshot = () => pending;
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useStockConfirmation() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
export function confirmStockAction(title: string, message: string): Promise<boolean> {
  if (pending) return Promise.resolve(false);
  return new Promise(resolve => {
    pending = { title, message, resolve, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    for (const listener of listeners) listener();
  });
}
function settle(expected: Confirmation, accepted: boolean): void {
  if (pending !== expected) return;
  pending = null; expected.resolve(accepted); for (const listener of listeners) listener();
}
export default function StockConfirmationDialog({ request, active }: { request: Confirmation | null; active: boolean }) {
  useEffect(() => {
    if (!request) return;
    if (!active) settle(request, false);
    return () => { settle(request, false); if (request.opener?.isConnected) request.opener.focus(); };
  }, [request, active]);
  if (!request || !active) return null;
  return <div className="svg-backdrop" onClick={() => settle(request, false)} onKeyDown={e => dialogKey(e, request)}>
    <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="stock-confirm-title" onClick={e => e.stopPropagation()}>
      <header className="svg-modal-head"><h2 id="stock-confirm-title">{request.title}</h2><button type="button" className="svg-btn tiny" onClick={() => settle(request, false)}>Cancel</button></header>
      <div className="svg-modal-body">
        <p className="svg-note whitespace-pre-wrap break-words">{request.message}</p>
        <div className="svg-modal-actions">
          <button type="button" className="svg-btn" autoFocus data-testid="stock-confirm-cancel" onClick={() => settle(request, false)}>Cancel</button>
          <button type="button" className="svg-btn primary" data-testid="stock-confirm-continue" onClick={() => settle(request, true)}>Continue</button>
        </div>
      </div>
    </section>
  </div>;
}
function dialogKey(e: KeyboardEvent<HTMLDivElement>, request: Confirmation): void {
  e.stopPropagation();
  if (e.key === "Escape") { e.preventDefault(); settle(request, false); }
  if (e.key !== "Tab") return;
  e.preventDefault();
  const buttons = [...e.currentTarget.querySelectorAll("button")], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[(at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
}
