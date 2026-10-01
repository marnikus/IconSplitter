// SvgControls.tsx — the control block of the Generate SVG tab (prompt §1/§5/§7):
// the scanned root with its rescan and the honest counts, the editable prompt
// (stored locally, resettable to the documented default) beside the provider
// card (model, timeout/retries/images-per-request, and the masked API key that
// lives only on this device), then the filter/sort/search row. No rule lives
// here — every value comes from the hook and every change goes back to it.

import { useState } from "react";
import { IMAGES_PER_REQUEST_MAX, IMAGES_PER_REQUEST_MIN, clampImagesPerRequest, modelLabel, type SvgConfig } from "../lib/svgconfig";
import { DEFAULT_SVG_PROMPT, isDefaultPrompt } from "../lib/svgprompt";
import type { SvgListFilter, SvgSort } from "../lib/svglist";
import type { Discovery } from "./sources";

export interface SvgControlsProps {
  rootName: string;
  discovery: Discovery | null;
  busy: string | null;
  counts: SvgCounts;
  prompt: string;
  provider: string;
  config: SvgConfig;
  keySet: boolean;
  keyMask: string;
  filter: SvgListFilter;
  sort: SvgSort;
  shown: number;
  total: number;
  onChooseRoot: () => void;
  onRescan: () => void;
  onPrompt: (text: string) => void;
  onResetPrompt: () => void;
  onConfig: (patch: Partial<SvgConfig>) => void;
  onSaveKey: (key: string) => void;
  onFilter: (patch: Partial<SvgListFilter>) => void;
  onSort: (sort: SvgSort) => void;
  onClearFilters: () => void;
}

export interface SvgCounts {
  eligible: number;
  generated: number;
  approved: number;
  failed: number;
}

export default function SvgControls(p: SvgControlsProps) {
  return (
    <section className="svg-controls" aria-label="SVG generation controls">
      <SourceLine rootName={p.rootName} discovery={p.discovery} busy={p.busy} counts={p.counts}
        onChooseRoot={p.onChooseRoot} onRescan={p.onRescan} />
      <div className="svg-toolbar">
        <PromptZone prompt={p.prompt} onPrompt={p.onPrompt} onReset={p.onResetPrompt} />
        <ProviderCard provider={p.provider} config={p.config} keySet={p.keySet} keyMask={p.keyMask}
          onConfig={p.onConfig} onSaveKey={p.onSaveKey} />
      </div>
      <FilterLine filter={p.filter} sort={p.sort} shown={p.shown} total={p.total}
        onFilter={p.onFilter} onSort={p.onSort} onClear={p.onClearFilters} />
    </section>
  );
}

function SourceLine({ rootName, discovery, busy, counts, onChooseRoot, onRescan }: {
  rootName: string; discovery: Discovery | null; busy: string | null; counts: SvgCounts;
  onChooseRoot: () => void; onRescan: () => void;
}) {
  return (
    <div className="svg-toolbar">
      <div className="svg-source">
        {rootName === ""
          ? <button type="button" className="svg-btn primary" data-testid="svg-choose-root" onClick={onChooseRoot}>Choose source folder…</button>
          : <>
            <span className="svg-path-pill" data-testid="svg-root" title={rootName}>📂 Root: {rootName}</span>
            <button type="button" className="svg-btn primary" data-testid="svg-rescan" disabled={busy !== null} onClick={onRescan}>
              {busy === null ? "↻ Rescan approved" : busy}
            </button>
          </>}
        <span className="svg-recursive" data-testid="svg-scope-copy">
          Approved Selection images only · recursive · {discovery?.sources.length ?? 0} sources
        </span>
      </div>
      <div className="svg-summary">
        <Chip value={counts.eligible} label="eligible" testid="svg-count-eligible" />
        <Chip value={counts.generated} label="generated" testid="svg-count-generated" />
        <Chip value={counts.approved} label="approved" cls="approved" testid="svg-count-approved" />
        <Chip value={counts.failed} label="failed" cls="failed" testid="svg-count-failed" />
      </div>
    </div>
  );
}

function Chip({ value, label, cls, testid }: { value: number; label: string; cls?: string; testid: string }) {
  return <span className={`svg-chip${cls ? ` ${cls}` : ""}`} data-testid={testid}><strong>{value}</strong>{label}</span>;
}

function PromptZone({ prompt, onPrompt, onReset }: { prompt: string; onPrompt: (t: string) => void; onReset: () => void }) {
  return (
    <div className="svg-prompt-zone">
      <div className="svg-field-label">
        <span>Generation prompt · saved locally{isDefaultPrompt(prompt) ? " · default" : ""}</span>
        <button type="button" className="svg-link" data-testid="svg-reset-prompt" onClick={onReset}>Reset default</button>
      </div>
      <textarea className="svg-prompt" data-testid="svg-prompt" aria-label="Generation prompt" spellCheck={false}
        value={prompt} onChange={(e) => onPrompt(e.target.value)} />
    </div>
  );
}

function ProviderCard({ provider, config, keySet, keyMask, onConfig, onSaveKey }: {
  provider: string; config: SvgConfig; keySet: boolean; keyMask: string;
  onConfig: (patch: Partial<SvgConfig>) => void; onSaveKey: (key: string) => void;
}) {
  return (
    <div className="svg-provider">
      <div className="svg-provider-top">
        <span><strong data-testid="svg-provider">{provider}</strong> · OpenAI-compatible</span>
        <span data-testid="svg-limits">timeout {Math.round(config.timeoutMs / 1000)}s · {config.retries} retries · {config.imagesPerRequest} per request</span>
      </div>
      <div className="svg-provider-fields">
        <NumberField label="Images / request" testid="svg-per-request" value={config.imagesPerRequest}
          min={IMAGES_PER_REQUEST_MIN} max={IMAGES_PER_REQUEST_MAX}
          onChange={(n) => onConfig({ imagesPerRequest: clampImagesPerRequest(n) })} />
        <label className="svg-field">
          <span className="svg-label">Model</span>
          <input className="svg-input" data-testid="svg-model" aria-label="Requesty model id" spellCheck={false}
            value={config.model} onChange={(e) => onConfig({ model: e.target.value })} />
        </label>
      </div>
      <KeyRow keySet={keySet} keyMask={keyMask} model={modelLabel(config.model)} onSave={onSaveKey} />
    </div>
  );
}

function KeyRow({ keySet, keyMask, model, onSave }: { keySet: boolean; keyMask: string; model: string; onSave: (k: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!editing) {
    return (
      <button type="button" className="svg-key-state" data-testid="svg-key-state" onClick={() => setEditing(true)}>
        <span aria-hidden="true">🛡</span>
        <strong>{keySet ? "API key secured locally" : "No API key yet"}</strong>
        <span className="svg-masked">{keyMask}</span>
        <span>{model} · excluded from Git · logs · exports</span>
      </button>
    );
  }
  return (
    <div className="svg-key-edit">
      <input className="svg-input" data-testid="svg-key-input" type="password" autoComplete="off" spellCheck={false}
        aria-label="Requesty API key" placeholder="rq_live_…" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft); setDraft(""); setEditing(false); } }} />
      <button type="button" className="svg-btn tiny primary" data-testid="svg-key-save"
        onClick={() => { onSave(draft); setDraft(""); setEditing(false); }}>Save</button>
      <button type="button" className="svg-btn tiny" data-testid="svg-key-cancel" onClick={() => setEditing(false)}>Cancel</button>
    </div>
  );
}

function FilterLine({ filter, sort, shown, total, onFilter, onSort, onClear }: {
  filter: SvgListFilter; sort: SvgSort; shown: number; total: number;
  onFilter: (patch: Partial<SvgListFilter>) => void; onSort: (s: SvgSort) => void; onClear: () => void;
}) {
  return (
    <div className="svg-filters">
      <Select label="Generation" testid="svg-filter-generation" value={filter.generation}
        options={[["all", "All states"], ["not-generated", "Not generated"], ["generating", "Generating"], ["generated", "Generated"], ["failed", "Failed"]]}
        onChange={(v) => onFilter({ generation: v as SvgListFilter["generation"] })} />
      <Select label="Review" testid="svg-filter-review" value={filter.review}
        options={[["all", "All reviews"], ["pending", "Pending"], ["approved", "Approved"], ["declined", "Declined"]]}
        onChange={(v) => onFilter({ review: v as SvgListFilter["review"] })} />
      <Select label="Sort by" testid="svg-sort" value={sort}
        options={[["date", "Newest generated"], ["name", "Filename"], ["generation", "Generation status"], ["review", "Review status"], ["cost", "Cost"]]}
        onChange={(v) => onSort(v as SvgSort)} />
      <label className="svg-field">
        <span className="svg-label">Search</span>
        <input className="svg-input" data-testid="svg-search" type="search" aria-label="Search sources"
          placeholder="Filename, folder, version or status…" value={filter.search}
          onChange={(e) => onFilter({ search: e.target.value })} />
      </label>
      <span className="svg-result-copy" data-testid="svg-shown">Showing {shown} of {total}</span>
      <button type="button" className="svg-btn" data-testid="svg-clear-filters" onClick={onClear}>× Clear filters</button>
    </div>
  );
}

function Select({ label, testid, value, options, onChange }: {
  label: string; testid: string; value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">{label}</span>
      <select className="svg-input" data-testid={testid} aria-label={label} value={value}
        onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, testid, value, min, max, onChange }: {
  label: string; testid: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">{label}</span>
      <input className="svg-input" data-testid={testid} type="number" min={min} max={max} step={1}
        aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Re-exported so the panel can restore the default prompt without an import. */
export { DEFAULT_SVG_PROMPT };
