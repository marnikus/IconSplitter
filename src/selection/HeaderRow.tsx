// HeaderRow.tsx — root picker, rescan, watcher pill, live counters, help.
import { useState } from "react";
import { counters } from "./state";
import type { ViewPair } from "../lib/reviewfilter";
import { scopeText, type ScanScope } from "../lib/splitscope";

export interface HeaderProps {
  rootName: string;
  scope: ScanScope;
  watcher: boolean;
  pairs: ViewPair[];
  chooseRoot: () => void;
  rescan: () => void;
  patch: (p: { watcher?: boolean }) => void;
}

export default function HeaderRow(p: HeaderProps) {
  const [help, setHelp] = useState(false);
  const c = counters(p.pairs);
  return (
    <section className="panel flex flex-wrap items-center gap-2">
      <button data-testid="sel-root" className="btn-primary" onClick={p.chooseRoot}>
        {p.rootName ? `Root: ${p.rootName}` : "Choose source folder…"}
      </button>
      <button data-testid="sel-rescan" className="btn-ghost" onClick={p.rescan}>↺ Rescan</button>
      <button
        data-testid="sel-watcher" onClick={() => p.patch({ watcher: !p.watcher })}
        className={`rounded-full px-3 py-1 text-xs font-medium ${p.watcher ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-400"}`}
        title="Auto-rescan every 30 s"
      >
        {p.watcher ? "● Watcher active" : "○ Watcher paused"}
      </button>
      {p.rootName !== "" && (
        <span className="text-xs text-slate-400" data-testid="sel-scope">{scopeText(p.scope, p.rootName)}</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Count n={c.total} label="total" cls="text-slate-200" />
        <Count n={c.pending} label="pending" cls="text-amber-300" />
        <Count n={c.approved} label="approved" cls="text-emerald-300" />
        <Count n={c.declined} label="declined" cls="text-rose-300" />
        <HelpBtn help={help} setHelp={setHelp} />
      </div>
    </section>
  );
}

function Count({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span className="rounded-lg border border-white/10 px-2 py-1 text-xs" data-testid={`sel-count-${label}`}>
      <b className={cls}>{n}</b> <span className="text-slate-400">{label}</span>
    </span>
  );
}

function HelpBtn({ help, setHelp }: { help: boolean; setHelp: (v: boolean) => void }) {
  return (
    <span className="relative">
      <button data-testid="sel-help" className="btn-ghost" aria-label="Keyboard shortcuts" onClick={() => setHelp(!help)}>?</button>
      {help && (
        <span className="absolute right-0 top-9 z-40 w-64 rounded-xl border border-white/10 bg-slate-900 p-3 text-xs text-slate-300 shadow-xl">
          <b className="text-slate-100">Keyboard</b>
          <br />A — approve · D — decline
          <br />↑ / ↓ — move selection
          <br />Space — fit / 100 % zoom
          <br />Ctrl+K — focus search
        </span>
      )}
    </span>
  );
}
