// Overlays.tsx — drag, busy and toast overlays for sheets mode
// Small focused components, each under 20 lines (RULE 18 ideal).

type BusyProps = { msg: string };
export function BusyOverlay({ msg }: BusyProps) {
  return (
    <div data-testid="busy-overlay" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 shadow-2xl">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        <span data-testid="busy-message" className="text-sm">{msg}</span>
      </div>
    </div>
  );
}

type ToastProps = { msg: string; err?: boolean };
export function ToastOverlay({ msg, err }: ToastProps) {
  return (
    <div data-testid="toast" className={`fixed left-1/2 z-50 toast-above-dock -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${err ? "bg-rose-600" : "bg-emerald-600"}`}>{msg}</div>
  );
}

export function DragOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-indigo-600/30 backdrop-blur-sm">
      <div className="rounded-2xl border-2 border-dashed border-white px-10 py-8 text-xl font-semibold">Drop images to detect icons</div>
    </div>
  );
}
