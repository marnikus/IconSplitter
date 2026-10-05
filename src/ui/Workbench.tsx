// Workbench.tsx — top-level shell: the mode switch, the global undo/redo bar and
// the session autosave. The providers sit ABOVE the panels, which is what makes
// an undo pressed on one tab able to reverse an action made on another (RULE 12).

import App from "../App";
import LogDock from "../log/LogDock";
import { log } from "../log/logstore";
import BatchPanel from "../batch/BatchPanel";
import SelectionPanel from "../selection/SelectionPanel";
import SelectionV2Panel from "../selectionv2/SelectionV2Panel";
import SvgPanel from "../svg/SvgPanel";
import { setAppState, type AppState } from "../state/appstore";
import { HistoryProvider } from "../state/HistoryProvider";
import { useAppState } from "../state/useAppState";
import { usePrefsAutosave } from "../state/usePrefsAutosave";
import { useSessionAutosave } from "../state/useSessionAutosave";
import HistoryBar from "./HistoryBar";

const TABS: { id: AppState["tab"]; label: string; testid: string }[] = [
  { id: "sheets", label: "Single sheets", testid: "tab-sheets" },
  { id: "batch", label: "Batch folders", testid: "tab-batch" },
  { id: "selection", label: "Selection", testid: "tab-selection" },
  { id: "selectionV2", label: "Selection V2", testid: "tab-selection-v2" },
  { id: "generateSvg", label: "Generate SVG", testid: "tab-generate-svg" },
];

export default function Workbench() {
  return (
    <HistoryProvider>
      <Shell />
    </HistoryProvider>
  );
}

function Shell() {
  const tab = useAppState().tab;
  useSessionAutosave();
  usePrefsAutosave();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-white/10 bg-slate-900/60 px-4 py-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <div className="flex gap-2" data-testid="tabbar">
            {TABS.map((t) => (
              <TabBtn key={t.id} active={tab === t.id} onClick={() => openTab(t.id)} testid={t.testid} label={t.label} />
            ))}
          </div>
          <div className="ml-auto">
            <HistoryBar />
          </div>
        </div>
      </nav>
      {tab === "sheets" && <App />}
      {tab === "batch" && <div className="mx-auto max-w-7xl px-4 py-6"><BatchPanel /></div>}
      {tab === "selection" && <div className="mx-auto max-w-[90rem] px-4 py-6"><SelectionPanel /></div>}
      {tab === "selectionV2" && <div className="v2-shell px-4 py-3"><SelectionV2Panel /></div>}
      {tab === "generateSvg" && <div className="svg-shell px-4 py-3"><SvgPanel /></div>}
      <LogDock />
    </div>
  );
}

/** Switching tabs is navigation, not an edit — it is restored, but not undoable. */
function openTab(tab: AppState["tab"]): void {
  log({ feature: "app", action: "open-tab", detail: `tab=${tab}`, data: { tab } });
  setAppState({ tab });
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
