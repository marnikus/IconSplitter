// Workbench.tsx — top-level mode switch: single sheets (original tool), the
// recursive batch processor and the two Selection review surfaces (V1 and the
// template-driven V2). Kept tiny so App.tsx (legacy) does not grow.

import { useState } from "react";
import App from "../App";
import BatchPanel from "../batch/BatchPanel";
import SelectionPanel from "../selection/SelectionPanel";
import SelectionV2Panel from "../selectionv2/SelectionV2Panel";

type Mode = "sheets" | "batch" | "selection" | "selectionV2";

export default function Workbench() {
  const [mode, setMode] = useState<Mode>("sheets");
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-white/10 bg-slate-900/60 px-4 py-2">
        <div className="mx-auto flex max-w-7xl gap-2">
          <TabBtn active={mode === "sheets"} onClick={() => setMode("sheets")} testid="tab-sheets" label="Single sheets" />
          <TabBtn active={mode === "batch"} onClick={() => setMode("batch")} testid="tab-batch" label="Batch folders" />
          <TabBtn active={mode === "selection"} onClick={() => setMode("selection")} testid="tab-selection" label="Selection" />
          <TabBtn active={mode === "selectionV2"} onClick={() => setMode("selectionV2")} testid="tab-selection-v2" label="Selection V2" />
        </div>
      </nav>
      {mode === "sheets" && <App />}
      {mode === "batch" && <div className="mx-auto max-w-7xl px-4 py-6"><BatchPanel /></div>}
      {mode === "selection" && <div className="mx-auto max-w-[90rem] px-4 py-6"><SelectionPanel /></div>}
      {mode === "selectionV2" && <div className="v2-shell px-4 py-3"><SelectionV2Panel /></div>}
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
