// Workbench.tsx — top-level shell: mode switch, undo/redo bar, session autosave, activity log
// Shell is ONE viewport column: nav, scrolling tab area (app-main), log dock last (not overlay).

import App from "../App";
import LogDock from "../log/LogDock";
import { log } from "../log/logstore";
import BatchPanel from "../batch/BatchPanel";
import SelectionPanel from "../selection/SelectionPanel";
import SelectionV2Panel from "../selectionv2/SelectionV2Panel";
import SvgPanel from "../svg/SvgPanel";
import UploadPanel from "../upload/UploadPanel";
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
  { id: "upload", label: "SVG to upload", testid: "tab-upload" },
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
    <div className="app-shell bg-slate-950 text-slate-100" data-testid="app-shell">
      <div className="progress-mounts flex flex-col gap-1">
        <div id="svg-progress-mount" data-testid="svg-progress-mount"></div>
        <div id="batch-progress-mount" data-testid="batch-progress-mount"></div>
      </div>
      <Nav tab={tab} />
      <main className="app-main" data-testid="app-main">
        <Panels tab={tab} />
      </main>
      <LogDock />
    </div>
  );
}

function Nav({ tab }: { tab: AppState["tab"] }) {
  return (
    <nav className="border-b border-white/10 bg-slate-900/60 px-4 py-2">
      <div className="flex w-full flex-wrap items-center gap-3">
        <TabBar tab={tab} />
        <div className="ml-auto">
          <HistoryBar />
        </div>
      </div>
    </nav>
  );
}

function TabBar({ tab }: { tab: AppState["tab"] }) {
  return (
    <div className="flex gap-2" data-testid="tabbar">
      {TABS.map((t) => (
        <TabBtn key={t.id} active={tab === t.id} onClick={() => openTab(t.id)} testid={t.testid} label={t.label} />
      ))}
    </div>
  );
}

function Panels({ tab }: { tab: AppState["tab"] }) {
  return (
    <>
      {tab === "sheets" && <App />}
      <div className="batch-shell-outer w-full" data-testid="batch-shell-outer" hidden={tab !== "batch"}>
        <TabWrapper>
          <BatchPanel />
        </TabWrapper>
      </div>
      {tab === "selection" && (
        <TabWrapper>
          <SelectionPanel />
        </TabWrapper>
      )}
      {tab === "selectionV2" && (
        <div className="v2-shell px-4 py-3">
          <SelectionV2Panel />
        </div>
      )}
      <div className="svg-shell px-4 py-3" data-testid="svg-shell" hidden={tab !== "generateSvg"}>
        <SvgPanel active={tab === "generateSvg"} />
      </div>
      {tab === "upload" && (
        <div className="up-shell px-4 py-3">
          <UploadPanel />
        </div>
      )}
    </>
  );
}

function TabWrapper({ children }: { children: React.ReactNode }) {
  return <div className="w-full px-4 py-6">{children}</div>;
}

function openTab(tab: AppState["tab"]): void {
  log({ feature: "app", action: "open-tab", detail: `tab=${tab}`, data: { tab } });
  setAppState({ tab });
}

function TabBtn({ active, onClick, label, testid }: { active: boolean; onClick: () => void; label: string; testid: string }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${active ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}
    >
      {label}
    </button>
  );
}
