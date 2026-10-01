// Shell.tsx owns the top-level tab bar. Both tabs stay mounted so sheet
// state survives switching; the inactive tab hides via `hidden`.

import { useState } from "react";
import App from "../App";
import BatchPanel from "./batch/BatchPanel";

type Tab = "sheets" | "batch";

const TABS: { id: Tab; label: string; testid: string }[] = [
  { id: "sheets", label: "Sheet editor", testid: "tab-sheets" },
  { id: "batch", label: "Batch folders", testid: "tab-batch" },
];

function tabClass(active: boolean): string {
  return `rounded-t-xl px-4 py-2 text-sm font-medium ${active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`;
}

function TabButton(props: { id: Tab; label: string; testid: string; active: boolean; onPick: (t: Tab) => void }) {
  return (
    <button data-testid={props.testid} onClick={() => props.onPick(props.id)} className={tabClass(props.active)}>
      {props.label}
    </button>
  );
}

export default function Shell() {
  const [tab, setTab] = useState<Tab>("sheets");
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="mx-auto flex max-w-7xl gap-1 px-4 pt-2" aria-label="Modes">
        {TABS.map((t) => (
          <TabButton key={t.id} id={t.id} label={t.label} testid={t.testid} active={tab === t.id} onPick={setTab} />
        ))}
      </nav>
      <div hidden={tab !== "sheets"}>
        <App />
      </div>
      <div hidden={tab !== "batch"}>
        <BatchPanel />
      </div>
    </div>
  );
}
