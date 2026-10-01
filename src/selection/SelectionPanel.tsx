// SelectionPanel.tsx — Selection mode shell (spec §1-12): header, filters,
// list + comparison, footer, honest banners, and global hotkeys (A/D/arrows/
// Space/Ctrl+K) via the tested keyToAction mapping (a11y §11).

import { useEffect, useState } from "react";
import { keyToAction } from "../lib/reviewmeta";
import { ALL_FILTER } from "../lib/reviewfilter";
import CompareView from "./CompareView";
import { CorruptNote, Overlays, WriteBanner } from "./Surfaces";
import FilterBar from "./FilterBar";
import HeaderRow from "./HeaderRow";
import PairList from "./PairList";
import StatusFooter from "./StatusFooter";
import { counters } from "./state";
import { copyPathText } from "./copypath";
import { hotTarget, isTextField, runHotAction } from "./hotkeys";
import { useThumbFor } from "./thumbs";
import { useSelection, type SelectionApi } from "./useSelection";

export default function SelectionPanel() {
  const api = useSelection();
  const [search, setSearch] = useState("");
  useHotkeys(api);
  useEffect(() => { api.setFilter({ ...api.s.filter, search }); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumbFor = useThumbFor(api.rootRef);
  if (!api.supported) return <UnsupportedNote onPick={api.chooseRoot} />;
  return (
    <div className="space-y-3">
      <HeaderRow rootName={api.s.rootName} watcher={api.s.watcher} pairs={api.s.pairs}
        chooseRoot={api.chooseRoot} rescan={api.rescan} patch={api.patch} />
      <Banners api={api} />
      {api.s.rootName !== "" && (
        <FilterBar filter={api.s.filter} sort={api.s.sort} shown={api.visible.length}
          setFilter={api.setFilter} setSort={api.setSort} />
      )}
      {api.s.rootName === ""
        ? <PickRootNote onPick={api.chooseRoot} />
        : <MainGrid api={api} search={search} setSearch={setSearch} thumbFor={thumbFor} />}
      <StatusFooter s={api.s} />
      <Overlays s={api.s} />
    </div>
  );
}

function Banners({ api }: { api: SelectionApi }) {
  return (
    <>
      {api.s.writeWarn && <WriteBanner warn={api.s.writeWarn} retry={api.retryWrite} />}
      {api.s.corrupt && <CorruptNote />}
    </>
  );
}

function MainGrid({ api, search, setSearch, thumbFor }: {
  api: SelectionApi; search: string; setSearch: (s: string) => void;
  thumbFor: ReturnType<typeof useThumbFor>;
}) {
  const selected = api.visible.find((v) => v.pairId === api.s.selectedId)
    ?? api.s.pairs.find((v) => v.pairId === api.s.selectedId) ?? null;
  const copyPath = (relPath: string) => { void copyPathText(api.s.rootName, relPath, api.say); };
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[22rem_1fr]">
      <PairList visible={api.visible} totalPairs={api.s.pairs.length} attention={counters(api.s.pairs).attention}
        selectedId={api.s.selectedId} collapsed={api.s.collapsed} search={search}
        select={api.select} setSearch={setSearch} patch={api.patch}
        clearFilters={() => { setSearch(""); api.setFilter(ALL_FILTER); }} thumbFor={thumbFor} />
      <CompareView pair={selected} rootName={api.s.rootName} rootRef={api.rootRef}
        zoom={api.s.zoom} sync={api.s.sync} autoNext={api.s.autoNext}
        patch={api.patch} decide={api.decide} copyPath={copyPath} />
    </div>
  );
}

function PickRootNote({ onPick }: { onPick: () => void }) {
  return (
    <section className="panel p-10 text-center">
      <p className="mb-3 text-sm text-slate-300">Pick the folder that holds your originals and <code>_AI</code> results.</p>
      <button className="btn-primary sel-focus" data-testid="sel-root-empty" onClick={onPick}>Choose source folder…</button>
    </section>
  );
}

function UnsupportedNote({ onPick }: { onPick: () => void }) {
  return (
    <section className="panel p-10 text-center" data-testid="sel-unsupported">
      <p className="mb-3 text-sm text-amber-200">Selection review needs the File System Access API — Chrome or Edge.</p>
      <button className="btn-ghost sel-focus" onClick={onPick}>Try anyway</button>
    </section>
  );
}

function useHotkeys(api: SelectionApi): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.querySelector("[data-testid='sel-search']") as HTMLInputElement | null)?.focus();
        return;
      }
      const act = keyToAction(e.key, isTextField(e.target));
      if (!act) return;
      e.preventDefault();
      runHotAction(act, hotTarget(api));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);
}
