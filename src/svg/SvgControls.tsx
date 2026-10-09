// SvgControls.tsx — the control block of the Generate SVG tab (prompt §1/§5/§7):
// the scanned root with its rescan and the honest counts, the editable prompt
// (stored locally, resettable to the documented default) beside the provider
// card (model, timeout/retries/images-per-request, and the masked API key that
// lives only on this device), then the filter/sort/search row. No rule lives
// here — every value comes from the hook and every change goes back to it.

import type { KeySource } from "../lib/keyvault";
import { KeyEditor, useKeyDraft, KeySlot, type KeySlotText } from "../ui/KeySlot";

import {
  IMAGES_PER_REQUEST_MAX, IMAGES_PER_REQUEST_MIN, RETRIES_MAX, RETRIES_MIN, TIMEOUT_MAX_MS, TIMEOUT_MIN_MS,
  clampImagesPerRequest, clampRetries, clampTimeoutMs, modelLabel, type SvgConfig,
} from "../lib/svgconfig";
import { stallLabel, stallNote } from "../lib/effortlimits";
import { DEFAULT_SVG_PROMPT, isDefaultPrompt } from "../lib/svgprompt";
import type { SvgListFilter, SvgSort } from "../lib/svglist";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import SvgSampling from "./SvgSampling";
import SourceLine, { type SvgCounts } from "./SourceLine";
import type { DirHandleLike } from "../lib/fs";
import type { Discovery } from "./sources";

export type { SvgCounts } from "./SourceLine";

export interface SvgControlsProps {
  rootName: string;
  root: DirHandleLike | null;
  discovery: Discovery | null;
  busy: string | null;
  counts: SvgCounts;
  prompt: string;
  provider: string;
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  paramNote: string | null;
  keySet: boolean;
  keyMask: string;
  keySource: KeySource;
  /** false while the provider card is minimized to its header (RULE 6 pref). */
  providerOpen: boolean;
  filter: SvgListFilter;
  sort: SvgSort;
  shown: number;
  total: number;
  onChooseRoot: () => void;
  onRescan: () => void;
  onPrompt: (text: string) => void;
  onResetPrompt: () => void;
  onConfig: (patch: Partial<SvgConfig>) => void;
  onParams: (patch: Partial<SamplingParams>) => void;
  onRefreshModels: () => void;
  onDismissNote: () => void;
  onSaveKey: (key: string) => void;
  onForgetKey: () => void;
  onProviderOpen: (open: boolean) => void;
  onFilter: (patch: Partial<SvgListFilter>) => void;
  onSort: (sort: SvgSort) => void;
  onClearFilters: () => void;
}

export default function SvgControls(p: SvgControlsProps) {
  return (
    <section className="svg-controls" aria-label="SVG generation controls">
      <SourceLine rootName={p.rootName} root={p.root} discovery={p.discovery} busy={p.busy} counts={p.counts}
        onChooseRoot={p.onChooseRoot} onRescan={p.onRescan} />
      <div className="svg-toolbar">
        <PromptZone prompt={p.prompt} onPrompt={p.onPrompt} onReset={p.onResetPrompt} />
        <ProviderCard provider={p.provider} config={p.config} caps={p.caps} params={p.params}
          paramNote={p.paramNote} keySet={p.keySet} keyMask={p.keyMask} keySource={p.keySource} open={p.providerOpen}
          onConfig={p.onConfig} onParams={p.onParams} onRefreshModels={p.onRefreshModels}
          onDismissNote={p.onDismissNote} onSaveKey={p.onSaveKey} onForgetKey={p.onForgetKey} onToggleOpen={p.onProviderOpen} />
      </div>
      <FilterLine filter={p.filter} sort={p.sort} shown={p.shown} total={p.total}
        onFilter={p.onFilter} onSort={p.onSort} onClear={p.onClearFilters} />
    </section>
  );
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

function ProviderCard({ provider, config, caps, params, paramNote, keySet, keyMask, keySource, open, onConfig, onParams, onRefreshModels, onDismissNote, onSaveKey, onForgetKey, onToggleOpen }: {
  provider: string; config: SvgConfig; caps: ModelCaps; params: SamplingParams; paramNote: string | null;
  keySet: boolean; keyMask: string; keySource: KeySource; open: boolean;
  onConfig: (patch: Partial<SvgConfig>) => void; onParams: (patch: Partial<SamplingParams>) => void;
  onRefreshModels: () => void; onDismissNote: () => void; onSaveKey: (key: string) => void; onForgetKey: () => void;
  onToggleOpen: (open: boolean) => void;
}) {
  return (
    <div className={`svg-provider${open ? "" : " closed"}`} data-testid="svg-provider-card">
      <ProviderHead provider={provider} config={config} caps={caps} params={params} open={open} onToggleOpen={onToggleOpen} />
      {open && (
        <>
          <ProviderFields config={config} onConfig={onConfig} />
          <SvgSampling caps={caps} params={params} note={paramNote} onParams={onParams}
            onRefresh={onRefreshModels} onDismissNote={onDismissNote} />
          <ProviderFoot keySet={keySet} keyMask={keyMask} keySource={keySource} model={modelLabel(config.model)} onForgetKey={onForgetKey}
            onSaveKey={onSaveKey} onRefreshModels={onRefreshModels} />
        </>
      )}
    </div>
  );
}

/** The settings that belong to the request, not to the model. */
function ProviderFields({ config, onConfig }: { config: SvgConfig; onConfig: (patch: Partial<SvgConfig>) => void }) {
  return (
    <div className="svg-provider-fields">
      <NumberField label="Images / request" testid="svg-per-request" value={config.imagesPerRequest}
        min={IMAGES_PER_REQUEST_MIN} max={IMAGES_PER_REQUEST_MAX}
        onChange={(n) => onConfig({ imagesPerRequest: clampImagesPerRequest(n) })} />
      <WaitField config={config} onConfig={onConfig} />
      <NumberField label="Retries" testid="svg-retries" value={config.retries} min={RETRIES_MIN} max={RETRIES_MAX}
        onChange={(n) => onConfig({ retries: clampRetries(n) })} />
      <label className="svg-field">
        <span className="svg-label">Model</span>
        <input className="svg-input" data-testid="svg-model" aria-label="Requesty model id" spellCheck={false}
          value={config.model} onChange={(e) => onConfig({ model: e.target.value })} />
      </label>
    </div>
  );
}

/** The wait in SECONDS — the same unit every label uses, clamped on change. */
function WaitField({ config, onConfig }: { config: SvgConfig; onConfig: (patch: Partial<SvgConfig>) => void }) {
  return (
    <NumberField label="Stall window (s)" testid="svg-timeout" value={Math.round(config.timeoutMs / 1000)}
      min={TIMEOUT_MIN_MS / 1000} max={TIMEOUT_MAX_MS / 1000}
      onChange={(s) => onConfig({ timeoutMs: clampTimeoutMs(s * 1000) })} />
  );
}

/** The one line that survives minimizing: who, which EFFECTIVE limits, and the toggle. */
function ProviderHead({ provider, config, caps, params, open, onToggleOpen }: {
  provider: string; config: SvgConfig; caps: ModelCaps; params: SamplingParams;
  open: boolean; onToggleOpen: (open: boolean) => void;
}) {
  // The user's size, never a tier cap; the tier only widens the stall window.
  const perRequest = clampImagesPerRequest(config.imagesPerRequest);
  const note = stallNote(config.timeoutMs, caps, params);
  return (
    <div className="svg-provider-top">
      <span><strong data-testid="svg-provider">{provider}</strong> · OpenAI-compatible</span>
      <span data-testid="svg-limits" title={note ?? undefined}>
        {stallLabel(config.timeoutMs, caps, params)} · {config.retries} retries · {perRequest} per request
      </span>
      <button type="button" className="svg-link" data-testid="svg-provider-toggle" aria-expanded={open}
        aria-label={open ? "Minimize model settings" : "Restore model settings"}
        onClick={() => onToggleOpen(!open)}>{open ? "Minimize" : "Restore"}</button>
    </div>
  );
}

/** The key state beside the one action that can change a model's limits. */
function ProviderFoot({ keySet, keyMask, keySource, model, onSaveKey, onForgetKey, onRefreshModels }: {
  keySet: boolean; keyMask: string; keySource: KeySource; model: string;
  onSaveKey: (k: string) => void; onForgetKey: () => void; onRefreshModels: () => void;
}) {
  return (
    <div className="svg-provider-foot">
      <KeyRow keySet={keySet} keyMask={keyMask} keySource={keySource} model={model} onSave={onSaveKey} onForget={onForgetKey} />
      <button type="button" className="svg-link" data-testid="svg-refresh-models" onClick={onRefreshModels}>
        Refresh model list
      </button>
    </div>
  );
}

/** The one text shell for the key slot: copy here, behaviour in `KeySlot`. */
const KEY_TEXT: KeySlotText = { testid: "svg", placeholder: "rq_live_…", ariaLabel: "Requesty API key" };

function KeyRow({keySet, keyMask, keySource, model, onSave, onForget}: {
  keySet: boolean; keyMask: string; keySource: KeySource; model: string;
  onSave: (k: string) => void; onForget: () => void;
}) {
  const slot = useKeyDraft();
  if (slot.editing) return <KeyEditor {...KEY_TEXT} draft={slot.draft} setDraft={slot.setDraft}
    onSave={onSave} onClose={slot.close} />;
  return <KeySlot {...KEY_TEXT} keySet={keySet} title={keyTitle(keySet, keySource)} mask={keyMask}
    note={keyNote(keySource) + " · " + model} onEdit={slot.open} onForget={onForget} />;
}

/** The one honest headline for the key's state. */
function keyTitle(keySet: boolean, source: KeySource): string {
  if (!keySet) return source === "unreadable" ? "Storage could not be read" : "No API key yet";
  return source === "session" ? "API key kept for this session only" : "API key secured locally";
}

/** ...and the one line that says what will happen after a reload. */
function keyNote(source: KeySource): string {
  if (source === "session") return "browser storage refused it — paste again after a reload";
  if (source === "unreadable") return "this device's storage is unreadable here (private mode?)";
  return "local only · excluded from Git · logs · exports";
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
