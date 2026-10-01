// Overlays.tsx — the two honest status surfaces every mode shares (RULE 2/4):
// a busy overlay with an optional stop action and the bottom toast.

export interface ToastMsg {
  msg: string;
  err?: boolean;
}

export function BusyOverlay({ msg, testid, onCancel }: { msg: string; testid: string; onCancel?: () => void }) {
  return (
    <div data-testid={testid} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 shadow-2xl">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        <span className="text-sm">{msg}</span>
        {onCancel && <button type="button" className="btn-mini" onClick={onCancel}>Stop</button>}
      </div>
    </div>
  );
}

export function Toast({ toast, testid }: { toast: ToastMsg; testid: string }) {
  return (
    <div
      data-testid={testid}
      role="status"
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${
        toast.err ? "bg-rose-600" : "bg-emerald-600"
      }`}
    >
      {toast.msg}
    </div>
  );
}
