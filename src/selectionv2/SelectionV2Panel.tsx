// SelectionV2Panel.tsx — shell of the V2 Selection surface (spec V2 §1-14):
// controls, honest banners, the bulk bar + list review (or the comparison
// layout), status bar, overlays and the shared A/D/arrow hotkeys. It owns no
// rule of its own — decisions, filters and persistence come from useSelection.

import { useEffect } from "react";
import { keyToAction } from "../lib/reviewmeta";
import { attentionInfo } from "../lib/pairing";
import { ALL_FILTER, type ViewPair } from "../lib/reviewfilter";
import { selectIntent } from "../lib/reviewselect";
import CompareView from "../selection/CompareView";
import { copyFolderText } from "../lib/copypath";
import { hotTarget, isTextField, runHotAction } from "../selection/hotkeys";
import StatusFooter from "../selection/StatusFooter";
import { CorruptNote, Overlays, PairFilesNote, WriteBanner } from "../selection/Surfaces";
import { useSideThumbs, type SideThumbFor } from "../selection/thumbs";
import { usePastePathCapture } from "../ui/usepathpaste";
import BulkBar from "./BulkBar";
import FilterGrid from "./FilterGrid";
import ReviewList from "./ReviewList";
import SourceBar from "./SourceBar";
import { useSelectionV2, type SelectionV2Api } from "./useSelectionV2";

export default function SelectionV2Panel() {
  const v = useSelectionV2();
  const thumbFor = useSideThumbs(v.core.rootRef);
  useHotkeys(v);
  usePastePathCapture(v.core.s.rootName, v.core.say);
  if (!v.core.supported) return <UnsupportedNote onPick={v.core.chooseRoot} />;
  return (
    <div className="v2" data-testid="v2-panel">
      <section className="v2-controls" aria-label="Review controls">
        <SourceBar rootName={v.core.s.rootName} scope={v.core.s.scope} pairs={v.core.s.pairs} mode={v.prefs.mode}
          chooseRoot={v.core.chooseRoot} rescan={v.core.rescan} setMode={v.setMode} />
        {v.core.s.rootName !== "" && (
          <FilterGrid filter={v.core.s.filter} sort={v.core.s.sort} shown={v.core.visible.length}
            setFilter={v.core.setFilter} setSort={v.core.setSort} />
        )}
      </section>
      <Banners v={v} />
      <Body v={v} thumbFor={thumbFor} />
      <StatusFooter s={v.core.s} className="v2-statusbar" />
      <Overlays s={v.core.s} toastTestid="v2-toast" busyTestid="v2-busy" />
    </div>
  );
}

function Banners({ v }: { v: SelectionV2Api }) {
  return (
    <>
      {v.core.s.writeWarn && (
        <WriteBanner className="v2-warning" testid="v2-writewarn" retryTestid="v2-retry"
          warn={v.core.s.writeWarn} retry={v.core.retryWrite} />
      )}
      {v.core.s.corrupt && <CorruptNote className="v2-warning" testid="v2-corrupt" />}
      <PairFilesNote files={v.core.s.corruptFiles} className="v2-warning" testid="v2-pairfiles" />
    </>
  );
}

function Body({ v, thumbFor }: { v: SelectionV2Api; thumbFor: SideThumbFor }) {
  if (v.core.s.rootName === "") return <PickRootNote onPick={v.core.chooseRoot} />;
  if (v.prefs.mode === "compare") return <CompareBody v={v} />;
  return (
    <div className="v2-workspace">
      <BulkBar header={v.header} checkedCount={v.checked.length} affectedCount={v.affected.length}
        blockedCount={v.blockedCount} hiddenCount={v.hiddenCount} visibleCount={v.core.visible.length}
        thumb={v.prefs.thumbHeight}
        onToggleAll={(on) => (on ? v.checkVisible() : v.uncheckAll())} onSelectVisible={v.checkVisible}
        onDeselectAll={v.uncheckAll} onThumb={v.setThumb}
        onDecide={(d) => v.core.decideBulk(v.affected, d)} onReset={() => v.core.resetBulk(v.affected)} />
      <ReviewList rows={v.core.visible} total={v.core.s.pairs.length} activeId={v.core.s.selectedId}
        checked={v.checked} thumb={v.prefs.thumbHeight} autoNext={v.core.s.autoNext} thumbFor={thumbFor}
        setAutoNext={(on) => v.core.patch({ autoNext: on })} onRowClick={(id, mods) => v.selectRow(id, selectIntent(mods))}
        toggleCheck={v.toggleCheck} decide={v.core.decide} openSide={(r) => openSide(v, r)}
        clearFilters={() => v.core.setFilter(ALL_FILTER)} />
    </div>
  );
}

function openSide(v: SelectionV2Api, relPath: string): void {
  void copyFolderText(v.core.s.rootName, relPath, v.core.say);
}

function CompareBody({ v }: { v: SelectionV2Api }) {
  const pair = activePair(v);
  return (
    <div className="v2-workspace">
      <PairPicker rows={v.core.visible} activeId={v.core.s.selectedId} select={v.core.select} />
      <CompareView pair={pair} rootName={v.core.s.rootName} rootRef={v.core.rootRef} zoom={v.core.s.zoom}
        sync={v.core.s.sync} autoNext={v.core.s.autoNext} patch={v.core.patch} decide={v.core.decide}
        copyPath={(r) => openSide(v, r)} resetOne={(id) => v.core.resetBulk([id])} />
    </div>
  );
}

function activePair(v: SelectionV2Api): ViewPair | null {
  const id = v.core.s.selectedId;
  return v.core.visible.find((p) => p.pairId === id) ?? v.core.s.pairs.find((p) => p.pairId === id) ?? null;
}

function PairPicker({ rows, activeId, select }: {
  rows: ViewPair[]; activeId: string | null; select: (id: string) => void;
}) {
  return (
    <label className="v2-field v2-picker">
      <span className="v2-label">Pair</span>
      <select className="v2-input" data-testid="v2-pair-picker" aria-label="Choose the pair to compare"
        value={activeId ?? ""} onChange={(e) => select(e.target.value)}>
        {rows.map((r) => <option key={r.pairId} value={r.pairId}>{pickerLabel(r)}</option>)}
      </select>
    </label>
  );
}

function pickerLabel(r: ViewPair): string {
  const warn = attentionInfo(r);
  return warn ? `${r.base} — ${warn}` : `${r.base} — ${r.decision}`;
}

function PickRootNote({ onPick }: { onPick: () => void }) {
  return (
    <section className="v2-panel v2-center" data-testid="v2-root-empty">
      <p>Pick the folder that holds your originals and <code>_AI</code> results.</p>
      <button type="button" className="v2-btn primary" onClick={onPick}>Choose source folder…</button>
    </section>
  );
}

function UnsupportedNote({ onPick }: { onPick: () => void }) {
  return (
    <section className="v2-panel v2-center" data-testid="v2-unsupported">
      <p>Selection review needs the File System Access API — Chrome or Edge.</p>
      <button type="button" className="v2-btn ghost" onClick={onPick}>Try anyway</button>
    </section>
  );
}

function useHotkeys(v: SelectionV2Api): void {
  const listMode = v.prefs.mode === "list";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = keyToAction(e.key, isTextField(e.target));
      // Space belongs to the focused control in list mode; only the comparison
      // layout uses it as the fit/1:1 zoom toggle.
      if (!act || (act === "zoom" && listMode)) return;
      e.preventDefault();
      runHotAction(act, hotTarget(v.core));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v, listMode]);
}
