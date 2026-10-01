// SelectionPanel.tsx — Selection mode shell (spec §1-13): header, filters,
// toolbar, Comparison vs List review layouts, bulk confirmation with honest
// counts, footer, banners, and global hotkeys (A/D/arrows/Space/Ctrl+K) via
// the tested keyToAction mapping (a11y §11).

import { useEffect, useMemo, useState } from "react";
import { keyToAction } from "../lib/reviewmeta";
import { ALL_FILTER } from "../lib/reviewfilter";
import { bulkSummary, planBulk, type BulkScope, type Verdict } from "../lib/reviewbulk";
import { headerCheck, hiddenIds, intersectIds } from "../lib/reviewselect";
import CompareView from "./CompareView";
import FilterBar from "./FilterBar";
import HeaderRow from "./HeaderRow";
import PairList from "./PairList";
import SelectionToolbar from "./SelectionToolbar";
import StatusFooter from "./StatusFooter";
import { counters, type SelState } from "./state";
import { fullPathText } from "./handles";
import { useUrlFor } from "./thumbs";
import type { ReviewListCtx } from "./PairRow";
import { useSelection, type SelectionApi } from "./useSelection";

interface ConfirmReq {
  scope: BulkScope;
  verdict: Verdict;
}

export default function SelectionPanel() {
  const api = useSelection();
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  useHotkeys(api);
  useEffect(() => { api.setFilter({ ...api.s.filter, search }); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const urlFor = useUrlFor(api.rootRef);
  const visibleIds = useMemo(() => api.visible.map((p) => p.pairId), [api.visible]);
  if (!api.supported) return <UnsupportedNote onPick={api.chooseRoot} />;
  return (
    <div className="space-y-3">
      <HeaderRow rootName={api.s.rootName} watcher={api.s.watcher} pairs={api.s.pairs}
        chooseRoot={api.chooseRoot} rescan={api.rescan} patch={api.patch} />
      <Banners api={api} />
      {api.s.rootName !== "" && (
        <TopControls api={api} visibleIds={visibleIds} requestBulk={(scope, verdict) => setConfirm({ scope, verdict })} />
      )}
      {api.s.rootName === ""
        ? <PickRootNote onPick={api.chooseRoot} />
        : <MainLayout api={api} urlFor={urlFor} visibleIds={visibleIds} search={search} setSearch={setSearch} />}
      <StatusFooter s={api.s} />
      <Overlays api={api} confirm={confirm} visibleIds={visibleIds} close={() => setConfirm(null)} />
    </div>
  );
}

function TopControls({ api, visibleIds, requestBulk }: {
  api: SelectionApi; visibleIds: string[];
  requestBulk: (scope: BulkScope, verdict: Verdict) => void;
}) {
  return (
    <>
      <FilterBar filter={api.s.filter} sort={api.s.sort} shown={api.visible.length}
        setFilter={api.setFilter} setSort={api.setSort} />
      <SelectionToolbar
        view={api.s.view} thumbH={api.s.thumbH} autoNext={api.s.autoNext}
        selectedCount={api.s.checked.length} visibleCount={api.visible.length}
        checkedVisible={intersectIds(api.s.checked, visibleIds).length}
        hiddenCount={hiddenIds(api.s.checked, visibleIds).length}
        patch={api.patch} setThumbH={api.setThumbH}
        selectAll={api.checkAll} deselectAll={api.uncheckAll} requestBulk={requestBulk} />
    </>
  );
}

function MainLayout({ api, urlFor, visibleIds, search, setSearch }: {
  api: SelectionApi; urlFor: ReviewListCtx["urlFor"]; visibleIds: string[];
  search: string; setSearch: (s: string) => void;
}) {
  const listCtx: ReviewListCtx = {
    variant: api.s.view === "list" ? "wide" : "side",
    thumbH: api.s.thumbH, checked: api.s.checked, activeId: api.s.activeId, urlFor,
    activate: api.activate, toggleCheck: api.toggleCheck, decide: api.decide,
    copyPath: (relPath: string) => { void copy(relPath, api); },
  };
  const listProps = {
    ctx: listCtx, visible: api.visible, totalPairs: api.s.pairs.length,
    attention: counters(api.s.pairs).attention,
    headerState: headerCheck(api.s.checked, visibleIds), onHeaderCheck: api.headerToggle,
    search, setSearch, patch: api.patch, collapsed: api.s.collapsed,
    clearFilters: () => { setSearch(""); api.setFilter(ALL_FILTER); },
  };
  if (api.s.view === "list") return <PairList {...listProps} />; // no comparison panel
  const active = api.visible.find((v) => v.pairId === api.s.activeId)
    ?? api.s.pairs.find((v) => v.pairId === api.s.activeId) ?? null;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[22rem_1fr]">
      <PairList {...listProps} />
      <CompareView pair={active} rootName={api.s.rootName} rootRef={api.rootRef}
        zoom={api.s.zoom} sync={api.s.sync} patch={api.patch}
        decide={api.decide} copyPath={listCtx.copyPath} />
    </div>
  );
}

function Overlays({ api, confirm, visibleIds, close }: {
  api: SelectionApi; confirm: ConfirmReq | null; visibleIds: string[]; close: () => void;
}) {
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
      {confirm && <BulkConfirmDialog api={api} req={confirm} visibleIds={visibleIds} close={close} />}
    </>
  );
}

function BulkConfirmDialog({ api, req, visibleIds, close }: {
  api: SelectionApi; req: ConfirmReq; visibleIds: string[]; close: () => void;
}) {
  const plan = planBulk(req.scope, api.s.checked, visibleIds);
  const sum = bulkSummary(api.s.pairs, plan.ids, req.verdict);
  const verb = req.verdict === "approved" ? "Approve" : "Decline";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm" data-testid="sel-bulk-confirm">
      <div role="alertdialog" aria-label="Confirm bulk decision" className="panel w-[26rem] p-5">
        <h3 className="mb-2 text-base font-semibold">{verb} {sum.total} pair{sum.total === 1 ? "" : "s"}?</h3>
        <ConfirmNotes sum={sum} hidden={plan.hiddenSkipped} verdict={req.verdict} />
        <div className="flex justify-end gap-2">
          <button data-testid="sel-bulk-cancel" className="btn-ghost sel-focus" onClick={close}>Cancel</button>
          <button
            data-testid="sel-bulk-apply" className="btn-primary sel-focus"
            onClick={() => { api.bulkDecide({ ids: plan.ids, verdict: req.verdict }); close(); }}
          >
            {verb} {sum.total}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmNotes({ sum, hidden, verdict }: { sum: ReturnType<typeof bulkSummary>; hidden: number; verdict: Verdict }) {
  return (
    <ul className="mb-4 space-y-1 text-sm text-slate-300">
      <li>{sum.total} will be {verdict}.</li>
      {sum.missing > 0 && <li>⚠ {sum.missing} of them {sum.missing === 1 ? "is" : "are"} missing the original or the AI result.</li>}
      {sum.changing > 0 && <li>{sum.changing} will change an earlier decision.</li>}
      {hidden > 0 && <li>{hidden} checked pair{hidden === 1 ? " is" : "s are"} hidden by filters and will not be affected.</li>}
    </ul>
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
  const id = api.s.activeId;
  if (act === "approve" && id) return api.decide(id, "approved");
  if (act === "decline" && id) return api.decide(id, "declined");
  if (act === "zoom") return api.patch({ zoom: api.s.zoom === "fit" ? "full" : "fit" });
  const at = api.visible.findIndex((v) => v.pairId === id);
  const next = act === "next" ? api.visible[at + 1] : api.visible[at - 1];
  if (next) api.activate(next.pairId);
}

async function copy(relPath: string, api: { s: SelState; say: (m: string, e?: boolean) => void }): Promise<void> {
  const text = fullPathText(api.s.rootName, relPath);
  try {
    await navigator.clipboard.writeText(text);
    api.say(`Path copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    api.say("Could not copy the path", true);
  }
}
