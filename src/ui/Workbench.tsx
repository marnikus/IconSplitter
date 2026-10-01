// Workbench.tsx — top-level shell: mode switch (single sheets, batch, the two
// Selection review surfaces), the global Undo/Redo controls and the app-level
// undo shortcuts. The Sheets and Batch panels stay mounted once visited so a
// long-running surface keeps its state and its history appliers stay live; the
// two Selection surfaces are alternative views of ONE review store, so
// switching between them never loses a decision, filter or check.

import { useState } from "react";
import App from "../App";
import BatchPanel from "../batch/BatchPanel";
import SelectionPanel from "../selection/SelectionPanel";
import SelectionV2Panel from "../selectionv2/SelectionV2Panel";
import HistoryBar from "../history/HistoryBar";
import { useUndoHotkeys } from "../history/undohotkeys";
import { getSession, setSessionTab } from "../session/sessionstore";
import type { TabId } from "../lib/session";

type Mode = TabId;

const TAB_LABELS: Record<Mode, string> = {
  sheets: "Single sheets", batch: "Batch folders", selection: "Selection", selectionV2: "Selection V2",
};

export default function Workbench() {
  const [mode, setMode] = useState<Mode>(() => getSession().tab);
  const [visited, setVisited] = useState<Mode[]>(() => keepAlive(getSession().tab));
  useUndoHotkeys();
  const open = (m: Mode) => {
    setMode(m);
    setVisited((v) => (v.includes(m) ? v : [...v, m]));
    setSessionTab(m); // the restored tab survives a restart (request §1)
  };
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-white/10 bg-slate-900/60 px-4 py-2">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          {(["sheets", "batch", "selection", "selectionV2"] as Mode[]).map((m) => (
            <TabBtn key={m} active={mode === m} onClick={() => open(m)} testid={tabTestid(m)} label={TAB_LABELS[m]} />
          ))}
          <div className="ml-auto"><HistoryBar /></div>
        </div>
      </nav>
      {visited.includes("sheets") && <Hidden show={mode === "sheets"}><App /></Hidden>}
      {visited.includes("batch") && <Hidden show={mode === "batch"}><div className="mx-auto max-w-7xl px-4 py-6"><BatchPanel /></div></Hidden>}
      {isSelection(mode) && (
        <div className={mode === "selection" ? "mx-auto max-w-[90rem] px-4 py-6" : "v2-shell px-4 py-3"}>
          {mode === "selection" ? <SelectionPanel /> : <SelectionV2Panel />}
        </div>
      )}
    </div>
  );
}

/** Panels that must survive a tab switch (their state is not in a store yet). */
function keepAlive(tab: Mode): Mode[] {
  return tab === "sheets" || tab === "batch" ? [tab] : [];
}

function isSelection(m: Mode): boolean {
  return m === "selection" || m === "selectionV2";
}

function tabTestid(m: Mode): string {
  return m === "selectionV2" ? "tab-selection-v2" : `tab-${m}`;
}

function Hidden({ show, children }: { show: boolean; children: React.ReactNode }) {
  return <div hidden={!show}>{children}</div>;
}

function TabBtn({ active, onClick, label, testid }: { active: boolean; onClick: () => void; label: string; testid: string }) {
  return (
    <button
      data-testid={testid} onClick={onClick} aria-current={active ? "page" : undefined}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
