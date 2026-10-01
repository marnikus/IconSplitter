// Workbench.tsx — top-level mode switch: single sheets (original tool) or the
// recursive batch processor. Kept tiny so App.tsx (legacy) does not grow.

import { useState } from "react";
import App from "../App";
import BatchPanel from "../batch/BatchPanel";
import SelectionPanel from "../selection/SelectionPanel";

type Mode = "sheets" | "batch" | "selection";

export default function Workbench() {
  const [mode, setMode] = useState<Mode>("sheets");
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-white/10 bg-slate-900/60 px-4 py-2">
        <div className="mx-auto flex max-w-7xl gap-2">
          <TabBtn active={mode === "sheets"} onClick={() => setMode("sheets")} testid="tab-sheets" label="Single sheets" />
          <TabBtn active={mode === "batch"} onClick={() => setMode("batch")} testid="tab-batch" label="Batch folders" />
          <TabBtn active={mode === "selection"} onClick={() => setMode("selection")} testid="tab-selection" label="Selection" />
        </div>
      </nav>
      {mode === "sheets" && <App />}
      {mode === "batch" && <div className="mx-auto max-w-7xl px-4 py-6"><BatchPanel /></div>}
      {mode === "selection" && <div className="mx-auto max-w-[90rem] px-4 py-6"><SelectionPanel /></div>}
    </div>
  );
}

function TabBtn({ active, onClick, label, testid }: { active: boolean; onClick: () => void; label: string; testid: string }) {
  return (
    <button
      data-testid={testid} onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
