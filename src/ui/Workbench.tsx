// Workbench.tsx — top-level mode switch: single sheets (original tool), the
// recursive batch processor, and the image review selection tab. Kept tiny so
// App.tsx (legacy) does not grow.

import { useState, type ReactNode } from "react";
import App from "../App";
import BatchPanel from "../batch/BatchPanel";
import ReviewPanel from "../review/ReviewPanel";

type Mode = "sheets" | "batch" | "review";

const TABS: { mode: Mode; testid: string; label: string }[] = [
  { mode: "sheets", testid: "tab-sheets", label: "Single sheets" },
  { mode: "batch", testid: "tab-batch", label: "Batch folders" },
  { mode: "review", testid: "tab-review", label: "Selection" },
];

export default function Workbench() {
  const [mode, setMode] = useState<Mode>("sheets");
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-white/10 bg-slate-900/60 px-4 py-2">
        <div className="mx-auto flex max-w-7xl gap-2">
          {TABS.map((tab) => (
            <TabBtn key={tab.mode} tab={tab} active={mode === tab.mode} onClick={() => setMode(tab.mode)} />
          ))}
        </div>
      </nav>
      <Panel mode={mode} />
    </div>
  );
}

function Panel({ mode }: { mode: Mode }) {
  if (mode === "sheets") return <App />;
  return <Frame>{mode === "batch" ? <BatchPanel /> : <ReviewPanel />}</Frame>;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>;
}

function TabBtn({ tab, active, onClick }: { tab: { testid: string; label: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={tab.testid}
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
    >
      {tab.label}
    </button>
  );
}
