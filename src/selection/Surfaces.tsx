// Surfaces.tsx — the honest reporting surfaces shared by both Selection
// surfaces (RULE 2/4): write-failure banner with Retry, corrupt-file note,
// toast and busy overlay. V1 keeps its default ids/skin; V2 passes its own so
// the same semantics render in the V2 design system (no second copy).

import type { SelState } from "./state";

export interface BannerProps {
  warn: string;
  retry: () => void;
  className?: string;
  testid?: string;
  retryTestid?: string;
}

export function WriteBanner(p: BannerProps) {
  return (
    <p
      data-testid={p.testid ?? "sel-writewarn"}
      className={p.className ?? "flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200"}
    >
      ⚠ {p.warn} <code className="text-xs">review-decisions.json</code>
      <button className="btn-mini ml-auto sel-focus" data-testid={p.retryTestid ?? "sel-retry"} onClick={p.retry}>
        ↻ Retry write
      </button>
    </p>
  );
}

export function CorruptNote({ className, testid }: { className?: string; testid?: string }) {
  return (
    <p
      data-testid={testid ?? "sel-corrupt"}
      className={className ?? "rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200"}
    >
      ⚠ review-decisions.json was corrupt — previous decisions were kept in memory.
    </p>
  );
}

export interface OverlayProps {
  s: SelState;
  toastClass?: string;
  toastTestid?: string;
  busyTestid?: string;
}

export function Overlays(p: OverlayProps) {
  return (
    <>
      {p.s.toast && (
        <div
          data-testid={p.toastTestid ?? "sel-toast"}
          className={p.toastClass
            ?? `fixed bottom-[calc(var(--log-dock-h,0px)_+_1.5rem)] left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${p.s.toast.err ? "bg-rose-600" : "bg-emerald-600"}`}
        >
          {p.s.toast.msg}
        </div>
      )}
      {p.s.busy && (
        <div data-testid={p.busyTestid ?? "sel-busy"} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
          <span className="rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 text-sm">{p.s.busy}</span>
        </div>
      )}
    </>
  );
}
