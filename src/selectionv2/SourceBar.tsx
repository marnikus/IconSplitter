// SourceBar.tsx — V2 control row one: root path pill, rescan, watcher, the
// layout switch (list review / comparison) and the live counters.

import type { ViewMode } from "../lib/reviewprefs";
import type { ViewPair } from "../lib/reviewfilter";
import { counters, type Counters } from "../selection/state";
import { scopeText, type ScanScope } from "../lib/splitscope";
import RootPathField from "../ui/RootPathField";
import { useRootLabel } from "../ui/userootpath";
import SegButton from "./SegButton";

export interface SourceBarProps {
  rootName: string;
  scope: ScanScope;
  pairs: ViewPair[];
  mode: ViewMode;
  watcher: boolean;
  chooseRoot: () => void;
  rescan: () => void;
  setMode: (mode: ViewMode) => void;
  toggleWatcher: () => void;
}

export default function SourceBar(p: SourceBarProps) {
  const label = useRootLabel(p.rootName); // the full path once it is known (I-36)
  return (
    <div className="v2-toolbar">
      <div className="v2-source">
        <button className="v2-path-pill" data-testid="v2-root" onClick={p.chooseRoot} title={label || undefined}>
          {label || "Choose source folder…"}
        </button>
        <button className="v2-btn primary" data-testid="v2-rescan" onClick={p.rescan}>↻ Rescan</button>
        <button className="v2-btn ghost" data-testid="v2-watcher" onClick={p.toggleWatcher} title="Auto-rescan every 30 s">
          {p.watcher ? "● Watcher active" : "○ Watcher paused"}
        </button>
        {p.rootName !== "" && <RootPathField key={p.rootName} rootName={p.rootName} testid="v2-root-path" />}
        {p.rootName !== "" && (
          <span className="v2-recursive" data-testid="v2-scan-scope">{scopeText(p.scope)}</span>
        )}
      </div>
      <div className="v2-toolbar-right">
        <ModeSwitch mode={p.mode} setMode={p.setMode} />
        <Summary c={counters(p.pairs)} />
      </div>
    </div>
  );
}

function ModeSwitch({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  return (
    <div className="v2-date-tabs" role="group" aria-label="Review layout">
      <SegButton active={mode === "list"} label="List review" testid="v2-mode-list" onClick={() => setMode("list")} />
      <SegButton active={mode === "compare"} label="Comparison" testid="v2-mode-compare" onClick={() => setMode("compare")} />
    </div>
  );
}

function Summary({ c }: { c: Counters }) {
  return (
    <div className="v2-summary">
      <Chip n={c.total} label="total" testid="v2-count-total" />
      <Chip n={c.pending} label="pending" testid="v2-count-pending" tone="pending" />
      <Chip n={c.approved} label="approved" testid="v2-count-approved" tone="approved" />
      <Chip n={c.declined} label="declined" testid="v2-count-declined" tone="declined" />
      {c.attention > 0 && <Chip n={c.attention} label="need attention" testid="v2-count-attention" tone="pending" />}
    </div>
  );
}

function Chip({ n, label, testid, tone }: { n: number; label: string; testid: string; tone?: string }) {
  return (
    <span className={`v2-chip${tone ? ` ${tone}` : ""}`} data-testid={testid}>
      <strong>{n}</strong> {label}
    </span>
  );
}
