// SelectionPanel.tsx — Selection mode shell (spec §1-12): header, filters,
// list + comparison, footer, honest banners, and global hotkeys (A/D/arrows/
// Space/Ctrl+K) via the tested keyToAction mapping (a11y §11).

import { useEffect, useState } from "react";
import { keyToAction } from "../lib/reviewmeta";
import { ALL_FILTER } from "../lib/reviewfilter";
import CompareView from "./CompareView";
import FilterBar from "./FilterBar";
import HeaderRow from "./HeaderRow";
import ListControls from "./ListControls";
import PairList from "./PairList";
import StatusFooter from "./StatusFooter";
import { counters } from "./state";
import { fullPathText } from "./handles";
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
      <HeaderRow rootName={api.s.rootName} watcher={api.s.watcher} pairs={api.visible}
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
      <Overlays api={api} />
    </div>
  );
}

function Banners({ api }: { api: SelectionApi }) {
  return (
    <>
      {api.s.writeWarn && <WriteBanner warn={api.s.writeWarn} retry={api.retryWrite} />}
      {api.s.corrupt && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="sel-corrupt">
          ⚠ review-decisions.json was corrupt — previous decisions were kept in memory.
        </p>
      )}
    </>
  );
}

function Overlays({ api }: { api: SelectionApi }) {
  return (
    <>
      {api.s.toast && (
        <div data-testid="sel-toast" className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${api.s.toast.err ? "bg-rose-600" : "bg-emerald-600"}`}>
          {api.s.toast.msg}
        </div>
      )}
      {api.s.busy && (
        <div data-testid="sel-busy" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
          <span className="rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 text-sm">{api.s.busy}</span>
        </div>
      )}
    </>
  );
}

function MainGrid({ api, search, setSearch, thumbFor }: {
  api: SelectionApi; search: string; setSearch: (s: string) => void;
  thumbFor: ReturnType<typeof useThumbFor>;
}) {
  const selected = api.visible.find((v) => v.pairId === api.s.selectedId)
    ?? api.s.pairs.find((v) => v.pairId === api.s.selectedId) ?? null;
  const copyPath = (relPath: string) => { void copy(relPath, api); };
  const visibleIds = api.visible.map((v) => v.pairId);
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[24rem_1fr]">
      <div className="space-y-2">
        <ListControls visibleIds={visibleIds} selectedIds={api.s.selectedIds} wrap={api.s.wrap}
          thumbSize={api.s.thumbSize} toggle={api.toggle} selectVis={api.selectVis} bulk={api.bulk} patch={api.patch} />
        <PairList visible={api.visible} totalPairs={api.s.pairs.length} attention={counters(api.s.pairs).attention}
          selectedId={api.s.selectedId} selectedIds={api.s.selectedIds} thumbSize={api.s.thumbSize}
          collapsed={api.s.collapsed} search={search}
          select={api.select} setSearch={setSearch} toggle={api.toggle} patch={api.patch}
          clearFilters={() => { setSearch(""); api.setFilter(ALL_FILTER); }} thumbFor={thumbFor} />
      </div>
      <CompareView pair={selected} rootName={api.s.rootName} rootRef={api.rootRef}
        zoom={api.s.zoom} sync={api.s.sync} autoNext={api.s.autoNext}
        patch={api.patch} decide={api.decide} copyPath={copyPath} />
    </div>
  );
}

function WriteBanner({ warn, retry }: { warn: string; retry: () => void }) {
  return (
    <p className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="sel-writewarn">
      ⚠ {warn} <code className="text-xs">review-decisions.json</code>
      <button className="btn-mini ml-auto sel-focus" data-testid="sel-retry" onClick={retry}>↻ Retry write</button>
    </p>
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
      const t = e.target as HTMLElement;
      const inField = t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
      const act = keyToAction(e.key, inField);
      if (!act) return;
      e.preventDefault();
      handle(act, api);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);
}

function handle(act: NonNullable<ReturnType<typeof keyToAction>>, api: SelectionApi): void {
  const id = api.s.selectedId;
  if (act === "approve" && id) return api.decide(id, "approved");
  if (act === "decline" && id) return api.decide(id, "declined");
  if (act === "zoom") return api.patch({ zoom: api.s.zoom === "fit" ? "full" : "fit" });
  api.move(act === "next" ? 1 : -1);
}

async function copy(relPath: string, api: SelectionApi): Promise<void> {
  const text = fullPathText(api.s.rootName, relPath);
  try {
    await navigator.clipboard.writeText(text);
    api.say(`Path copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    api.say("Could not copy the path", true);
  }
}
