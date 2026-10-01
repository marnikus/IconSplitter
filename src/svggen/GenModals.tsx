// GenModals.tsx — confirm-generation, code view and version history dialogs.
// Confirm shows count, provider/model and the prompt that will be sent; the
// code modal carries the complete validated SVG for manual copy (a11y fallback
// when the clipboard is unavailable).

import type { SvgVersionRec } from "../lib/svgsidecar";
import { useEscape } from "../ui/useEscape";

const WRAP = "fixed inset-0 z-50 grid place-items-center bg-black/60 p-4";
const CARD = "w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-2xl";
const BTN = "rounded-lg border border-white/10 px-3 py-1 text-sm enabled:hover:bg-white/10";

export function ConfirmModal({ count, model, prompt, onCancel, onGo }: {
  count: number; model: string; prompt: string; onCancel: () => void; onGo: () => void;
}) {
  useEscape(onCancel);
  return (
    <div className={WRAP} data-testid="sg-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="sg-confirm-title">
      <section className={CARD}>
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <h2 id="sg-confirm-title" className="text-sm font-semibold">Confirm SVG generation</h2>
          <button type="button" onClick={onCancel} className={BTN}>Close</button>
        </header>
        <div className="grid gap-2 p-4 text-xs text-slate-300">
          <p><span data-testid="sg-confirm-count">{count}</span> image{count === 1 ? "" : "s"} · {model}</p>
          <p className="max-h-24 overflow-auto rounded-lg bg-slate-950 p-2 text-slate-400">{prompt}</p>
          <p>Existing versions are never overwritten; a new attempt writes the next version number.</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-4 py-2">
          <button type="button" onClick={onCancel} className={BTN}>Cancel</button>
          <button type="button" data-testid="sg-confirm-go" onClick={onGo} className="rounded-lg bg-indigo-500 px-3 py-1 text-sm text-white hover:bg-indigo-400">Generate now</button>
        </footer>
      </section>
    </div>
  );
}

export function CodeModal({ code, onClose }: { code: string; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className={WRAP} data-testid="sg-code-modal" role="dialog" aria-modal="true" aria-labelledby="sg-code-title">
      <section className={CARD}>
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <h2 id="sg-code-title" className="text-sm font-semibold">SVG code</h2>
          <button type="button" onClick={onClose} className={BTN}>Close</button>
        </header>
        <pre data-testid="sg-code-block" className="max-h-96 overflow-auto p-4 text-[11px] text-slate-300">{code}</pre>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-4 py-2">
          <button type="button" data-testid="sg-copy-code" onClick={() => void navigator.clipboard?.writeText(code).catch(() => undefined)} className={BTN}>Copy SVG code</button>
          <button type="button" onClick={onClose} className={BTN}>Done</button>
        </footer>
      </section>
    </div>
  );
}

export function HistoryModal({ versions, onClose }: { versions: SvgVersionRec[]; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className={WRAP} data-testid="sg-history-modal" role="dialog" aria-modal="true" aria-labelledby="sg-history-title">
      <section className={CARD}>
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <h2 id="sg-history-title" className="text-sm font-semibold">Saved versions</h2>
          <button type="button" onClick={onClose} className={BTN}>Close</button>
        </header>
        <ul className="max-h-96 overflow-auto p-2 text-xs">
          {versions.length === 0 && <li className="p-2 text-slate-500">No versions yet</li>}
          {[...versions].reverse().map((v) => (
            <li key={v.version} data-testid={`sg-version-${v.version}`} className="flex gap-2 rounded px-2 py-1 text-slate-300">
              <span className="font-mono">v{v.version}</span>
              <span>{v.status}{v.validationOk ? "" : " · invalid"}</span>
              <span className="text-slate-500">{v.review}</span>
              <span className="ml-auto text-slate-500">{v.tokensTotal !== null ? `${v.tokensTotal} tok` : "no usage"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
