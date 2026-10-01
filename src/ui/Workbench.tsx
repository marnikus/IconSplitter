// Workbench.tsx — the app shell: brand, mode tabs (Single sheets / Batch
// folders / Selection), the help popover and the status slot a panel may fill.
// App.tsx (legacy) stays untouched behind the shell.

import { useState, type ReactNode } from "react";
import App from "../App";
import BatchPanel from "../batch/BatchPanel";
import ReviewPanel from "../review/ReviewPanel";
import { ChromeProvider } from "./AppChrome";
import Brand from "./Brand";
import HelpButton from "./HelpButton";

type Mode = "sheets" | "batch" | "review";

const TABS: { mode: Mode; testid: string; label: string }[] = [
  { mode: "sheets", testid: "tab-sheets", label: "Single sheets" },
  { mode: "batch", testid: "tab-batch", label: "Batch folders" },
  { mode: "review", testid: "tab-review", label: "Selection" },
];

export default function Workbench() {
  const [mode, setMode] = useState<Mode>("sheets");
  return (
    <ChromeProvider>
      {(slot) => (
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <header className="flex h-14 items-center gap-4 border-b border-white/10 bg-slate-900/70 px-4">
            <Brand />
            <nav className="flex h-full items-stretch gap-1" aria-label="Modes">
              {TABS.map((tab) => (
                <TabBtn key={tab.mode} tab={tab} active={mode === tab.mode} onClick={() => setMode(tab.mode)} />
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3" data-testid="app-status-slot">{slot}</div>
            <HelpButton />
          </header>
          <Panel mode={mode} />
        </div>
      )}
    </ChromeProvider>
  );
}

function Panel({ mode }: { mode: Mode }) {
  if (mode === "sheets") return <App />;
  return <div className="mx-auto max-w-[1600px] px-4 py-4">{mode === "batch" ? <BatchPanel /> : <ReviewPanel />}</div>;
}

function TabBtn({ tab, active, onClick }: { tab: { testid: string; label: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={tab.testid}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`relative px-3 text-sm font-medium transition focus-visible:outline-none ${
        active ? "text-white" : "text-slate-400 hover:text-slate-200"
      } ${active ? "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-indigo-400" : ""}`}
    >
      {tab.label}
    </button>
  );
}

export function PanelFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] px-4 py-4">{children}</div>;
}
