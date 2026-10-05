// SourceBar.tsx — V2 control row one: the green Open folder button, rescan,
// the layout switch (list review / comparison) and the live counters, plus the
// full-width read-only path row below (the remembered full path once captured,
// else the folder name — never an input, I-44).

import type { ViewMode } from "../lib/reviewprefs";
import type { ViewPair } from "../lib/reviewfilter";
import { counters, type Counters } from "../selection/state";
import { scopeText, type ScanScope } from "../lib/splitscope";
import { useRootPath } from "../ui/userootpath";
import PathHint from "../ui/PathHint";
import SegButton from "./SegButton";

export interface SourceBarProps {
  rootName: string;
  scope: ScanScope;
  pairs: ViewPair[];
  mode: ViewMode;
  chooseRoot: () => void;
  rescan: () => void;
  setMode: (mode: ViewMode) => void;
}

export default function SourceBar(p: SourceBarProps) {
  return (
    <>
      <div className="v2-toolbar">
        <div className="v2-source">
          <button type="button" className="v2-btn open" data-testid="v2-root" onClick={p.chooseRoot}>
            📂 Open folder
          </button>
          <button type="button" className="v2-btn primary" data-testid="v2-rescan" onClick={p.rescan}>↻ Rescan</button>
          {p.rootName !== "" && (
            <span className="v2-recursive" data-testid="v2-scan-scope">{scopeText(p.scope, p.rootName)}</span>
          )}
        </div>
        <div className="v2-toolbar-right">
          <ModeSwitch mode={p.mode} setMode={p.setMode} />
          <Summary c={counters(p.pairs)} />
        </div>
      </div>
      <PathRow rootName={p.rootName} />
    </>
  );
}

/** The picked folder, as read-only text: full path once known, else its name. */
function PathRow({ rootName }: { rootName: string }) {
  const stored = useRootPath(rootName);
  if (rootName === "") {
    return <p className="v2-pathrow empty" data-testid="v2-path">No folder selected — open a folder to start</p>;
  }
  const label = stored.path === "" ? rootName : stored.path;
  return (
    <>
      <p className="v2-pathrow" data-testid="v2-path" title={label}>📁 {label}</p>
      {stored.path === "" && <PathHint testid="v2-path-hint" />}
    </>
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
