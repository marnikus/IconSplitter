// GeneratePanel.tsx — the Generate SVG tab (template: design temp/SVG tab
// generation). Approved Selection sources only; generate/review/version/copy.
// The confirm dialog shows count, model, prompt and an estimated ceiling
// before anything is sent (spec §1/§2).

import { useState } from "react";
import { loadConfig } from "./configstore";
import GenRow, { type GenRowMods } from "./GenRow";
import { CodeModal, ConfirmModal, HistoryModal } from "./GenModals";
import { useSvgGen } from "./useSvgGen";

export default function GeneratePanel() {
  const v = useSvgGen();
  const [pending, setPending] = useState<string[] | null>(null);
  const [modal, setModal] = useState<{ kind: "code" | "history"; id: string } | null>(null);
  const [code, setCode] = useState("");
  const cfg = loadConfig();

  if (!v.supported) return <UnsupportedNote />;
  if (v.rootName === "") return <RootNote onPick={v.chooseRoot} />;
  const mods = rowMods(v, setPending, setCode, setModal);

  return (
    <section className="flex flex-col gap-3" data-testid="sg-panel">
      <Controls v={v} cfgModel={cfg.model} />
      <BulkBar v={v} onGenerate={() => setPending(v.checked)} />
      <ListSection v={v} mods={mods} />
      {v.toast && <p role="status" data-testid="sg-toast" className="text-xs text-slate-300">{v.toast}</p>}
      {pending && (
        <ConfirmModal count={pending.length} model={cfg.model} prompt={v.prompt}
          onCancel={() => setPending(null)} onGo={() => { void v.generate(pending); setPending(null); }} />
      )}
      {modal?.kind === "code" && <CodeModal code={code} onClose={() => setModal(null)} />}
      {modal?.kind === "history" && <HistoryModal versions={v.versionsOf(modal.id)} onClose={() => setModal(null)} />}
    </section>
  );
}

function ListSection({ v, mods }: { v: ReturnType<typeof useSvgGen>; mods: GenRowMods }) {
  return (
    <div className="rounded-xl border border-white/10">
      <header className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
        <h1 className="text-sm font-semibold text-slate-100">APPROVED SOURCES / SVG OUTPUT</h1>
        <span data-testid="sg-count">{v.visible.length}</span>
      </header>
      <div data-testid="sg-rows" role="list" aria-label="SVG generation sources">
        {v.visible.map((r) => (
          <GenRow key={r.pairId} row={r} mods={{ ...mods, checked: v.checked.includes(r.pairId) }} />
        ))}
        {v.visible.length === 0 && <p data-testid="sg-empty" className="p-4 text-sm text-slate-500">No approved sources match — approve images in Selection first.</p>}
      </div>
    </div>
  );
}

function UnsupportedNote() {
  return <section data-testid="sg-unsupported" className="p-6 text-sm text-slate-400">Folder access needs Chrome or Edge — the Generate SVG tab reads your approved images from disk.</section>;
}

function RootNote({ onPick }: { onPick: () => void }) {
  return (
    <section data-testid="sg-root-empty" className="p-6 text-sm text-slate-300">
      Pick the folder you reviewed in Selection — only approved AI images are listed here.{" "}
      <button type="button" data-testid="sg-pick-root" onClick={onPick} className="rounded-lg bg-indigo-500 px-3 py-1 text-white">Choose folder</button>
    </section>
  );
}

type ModalState = { kind: "code" | "history"; id: string } | null;

function rowMods(v: ReturnType<typeof useSvgGen>, setPending: (p: string[] | null) => void, setCode: (s: string) => void, setModal: (m: ModalState) => void): GenRowMods {
  return {
    checked: false,
    onCheck: v.toggle,
    onGenerate: (id) => setPending([id]),
    onReview: (id, r) => void v.review([id], r),
    onCopy: (id) => void copySvg(v, id),
    onCode: (id) => void openCode(v, id, setCode, setModal),
    onHistory: (id) => setModal({ kind: "history", id }),
  };
}

async function copySvg(v: ReturnType<typeof useSvgGen>, id: string): Promise<void> {
  const text = await v.svgText(id);
  if (text === null) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard unavailable: the Code modal still shows the full text
  }
}

async function openCode(v: ReturnType<typeof useSvgGen>, id: string, setCode: (s: string) => void, setModal: (m: { kind: "code" | "history"; id: string }) => void): Promise<void> {
  const text = await v.svgText(id);
  setCode(text ?? "");
  setModal({ kind: "code", id });
}

function KeyControl({ v }: { v: ReturnType<typeof useSvgGen> }) {
  const [keyDraft, setKeyDraft] = useState("");
  return (
    <label className="ml-auto flex items-center gap-2 text-slate-400">
      Requesty key
      {v.keyMasked === "" ? (
        <>
          <input data-testid="sg-key-input" type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="rq_live_…" className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1" />
          <button type="button" data-testid="sg-key-save" onClick={() => { v.saveKey(keyDraft); setKeyDraft(""); }} className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/10">Save key</button>
        </>
      ) : (
        <span data-testid="sg-key" className="font-mono text-slate-300">{v.keyMasked}</span>
      )}
    </label>
  );
}

function Controls({ v, cfgModel }: { v: ReturnType<typeof useSvgGen>; cfgModel: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 p-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-lg bg-indigo-500/20 px-2 py-1 text-indigo-200">Root: {v.rootName}</span>
        <button type="button" data-testid="sg-rescan" onClick={v.rescan} className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/10">↻ Rescan approved</button>
        <span className="text-slate-500">Approved Selection images only · recursive</span>
        <KeyControl v={v} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500">
            <span>Generation prompt · saved locally</span>
            <button type="button" data-testid="sg-reset-prompt" onClick={v.resetPrompt} className="text-indigo-300">Reset default</button>
          </div>
          <textarea data-testid="sg-prompt" value={v.prompt} onChange={(e) => v.editPrompt(e.target.value)} rows={2} className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-xs" />
        </div>
        <div className="text-[10px] text-slate-500">
          <div><strong className="text-slate-300">Requesty</strong> · {cfgModel}</div>
          <div>timeout 90s · 2 retries · 4 concurrent</div>
        </div>
      </div>
      <Filters v={v} />
    </div>
  );
}

function Filters({ v }: { v: ReturnType<typeof useSvgGen> }) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label>Generation
        <select data-testid="sg-filter-gen" value={v.filters.generation} onChange={(e) => v.setFilters({ ...v.filters, generation: e.target.value as typeof v.filters.generation })} className={SEL}>
          <option value="all">All states</option><option value="not-generated">Not generated</option>
          <option value="generating">Generating</option><option value="generated">Generated</option>
          <option value="failed">Failed</option><option value="interrupted">Interrupted</option>
        </select>
      </label>
      <label>Review
        <select data-testid="sg-filter-review" value={v.filters.review} onChange={(e) => v.setFilters({ ...v.filters, review: e.target.value as typeof v.filters.review })} className={SEL}>
          <option value="all">All reviews</option><option value="pending">Pending</option>
          <option value="approved">Approved</option><option value="declined">Declined</option>
        </select>
      </label>
      <label>Sort by
        <select data-testid="sg-sort" value={v.sortBy} onChange={(e) => v.setSortBy(e.target.value as typeof v.sortBy)} className={SEL}>
          <option value="newest">Newest</option><option value="name">Filename</option>
          <option value="generation">Generation</option><option value="review">Review</option><option value="cost">Cost</option>
        </select>
      </label>
      <label className="flex-1">Search
        <input data-testid="sg-search" type="search" value={v.filters.search} onChange={(e) => v.setFilters({ ...v.filters, search: e.target.value })} className={SEL} placeholder="filename or folder…" />
      </label>
      <button type="button" data-testid="sg-clear-filters" onClick={() => v.setFilters({ generation: "all", review: "all", search: "" })} className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/10">× Clear filters</button>
    </div>
  );
}

function BulkBar({ v, onGenerate }: { v: ReturnType<typeof useSvgGen>; onGenerate: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-2 text-xs">
      <input type="checkbox" data-testid="sg-select-visible" aria-label="Select all visible"
        checked={v.visible.length > 0 && v.visible.every((r) => v.checked.includes(r.pairId))} onChange={(e) => (e.target.checked ? v.checkVisible() : v.deselectAll())} />
      <span data-testid="sg-selected-count">{v.checked.length} selected</span>
      <button type="button" data-testid="sg-deselect" onClick={v.deselectAll} className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/10">Deselect all</button>
      <span className="ml-auto" />
      <button type="button" data-testid="sg-generate-selected" disabled={v.checked.length === 0} onClick={onGenerate} className="rounded-lg bg-indigo-500 px-2 py-1 text-white enabled:hover:bg-indigo-400 disabled:opacity-40">✦ Generate selected</button>
      <button type="button" data-testid="sg-approve-selected" disabled={v.checked.length === 0} onClick={() => void v.review(v.checked, "approved")} className="rounded-lg border border-emerald-500/40 px-2 py-1 text-emerald-300 enabled:hover:bg-emerald-500/10 disabled:opacity-40">✓ Approve selected</button>
      <button type="button" data-testid="sg-decline-selected" disabled={v.checked.length === 0} onClick={() => void v.review(v.checked, "declined")} className="rounded-lg border border-rose-500/40 px-2 py-1 text-rose-300 enabled:hover:bg-rose-500/10 disabled:opacity-40">✕ Decline selected</button>
    </div>
  );
}

const SEL = "rounded-lg border border-white/10 bg-slate-900 px-2 py-1";
