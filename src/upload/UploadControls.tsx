// UploadControls.tsx — the control block of the "SVG to upload" tab (design
// §1/§2.8): the scanned root with its rescan and the honest counts, then the
// metadata PROMPT panel beside the Gemini card (endpoint, model,
// timeout/retries/concurrency, the masked key that lives only on this device),
// then the filter/sort/search row. The provider card is one contained grid, so
// no control can escape or overlap its box at any width; the prompt has its own
// large panel (UploadPromptPanel) and is never squeezed into that card.
// No rule lives here — every value comes from the hook and every change goes
// straight back to it.

import type { KeySource } from "../lib/keyvault";
import { KeyEditor, useKeyDraft, KeySlot, type KeySlotText } from "../ui/KeySlot";

import {
  CONCURRENCY_MAX, CONCURRENCY_MIN, DEFAULT_MODEL, generateContentUrl,
  clampConcurrency, clampRetries, clampTimeoutMs, PROVIDER_NAME,
  RETRIES_MAX, RETRIES_MIN, TIMEOUT_MAX_MS, TIMEOUT_MIN_MS,
  type GeminiConfig,
} from "../lib/upload/gemini";
import type { ModelCheck, UploadListFilter, UploadSort } from "./types";
import UploadPromptPanel, { type UploadPromptPanelProps } from "./UploadPromptPanel";
import type { UploadDiscovery } from "./discovery";
import type { UploadCounts } from "./rowmodel";
import { auditLine } from "./scan";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";

export interface UploadControlsProps {
  rootName: string;
  discovery: UploadDiscovery | null;
  busy: string | null;
  counts: UploadCounts;
  gemini: GeminiConfig;
  modelCheck: ModelCheck;
  keySet: boolean;
  keyMask: string;
  keySource: KeySource;
  /** false while the provider card is minimized to its header (RULE 6 pref). */
  providerOpen: boolean;
  filter: UploadListFilter;
  sort: UploadSort;
  shown: number;
  total: number;
  /** The whole prompt panel — one prop, so this file stays one screen of props. */
  promptPanel: UploadPromptPanelProps;
  onChooseRoot: () => void;
  onRescan: () => void;
  onGemini: (patch: Partial<GeminiConfig>) => void;
  onCheckModel: () => void;
  onProviderOpen: (open: boolean) => void;
  onSaveKey: (key: string) => void;
  onForgetKey: () => void;
  onFilter: (patch: Partial<UploadListFilter>) => void;
  onSort: (sort: UploadSort) => void;
  onClearFilters: () => void;
}

export default function UploadControls(p: UploadControlsProps) {
  return (
    <section className="svg-controls" aria-label="SVG to upload controls">
      <SourceLine p={p} />
      <div className="svg-toolbar panels">
        <UploadPromptPanel {...p.promptPanel} />
        <ProviderCard p={p} />
      </div>
      <FilterLine p={p} />
    </section>
  );
}

/** The folder button, the rescan, the scope copy, the audit line, the chips. */
function SourceLine({ p }: { p: UploadControlsProps }) {
  return (
    <>
      <div className="svg-toolbar">
        <div className="svg-source">
          <OpenFolderButton testid="upload-open-folder" onClick={p.onChooseRoot} />
          {p.rootName !== "" && (
            <button type="button" className="svg-btn" data-testid="upload-rescan" disabled={p.busy !== null} onClick={p.onRescan}>
              {p.busy === null ? "↻ Rescan" : p.busy}
            </button>
          )}
          <span className="svg-recursive" data-testid="upload-scope-copy">
            Approved SVGs only · recursive · {p.discovery?.rows.length ?? 0} icons
          </span>
          {p.discovery !== null && <span className="svg-audit" data-testid="upload-audit">{auditLine(p.discovery)}</span>}
        </div>
        <div className="svg-summary">
          <Chip value={p.counts.icons} label="icons" testid="upload-count-icons" />
          <Chip value={p.counts.processed} label="processed" cls="approved" testid="upload-count-processed" />
          <Chip value={p.counts.partial} label="partial" cls="failed" testid="upload-count-partial" />
          <Chip value={p.counts.failed} label="failed" cls="failed" testid="upload-count-failed" />
          <Chip value={p.counts.stale} label="stale" testid="upload-count-stale" />
        </div>
      </div>
      <FolderPathRow rootName={p.rootName} testid="upload-folder-path" />
    </>
  );
}

function Chip({ value, label, cls, testid }: { value: number; label: string; cls?: string; testid: string }) {
  return <span className={`svg-chip${cls ? ` ${cls}` : ""}`} data-testid={testid}><strong>{value}</strong>{label}</span>;
}

/** The Gemini provider card: the five request settings, the check, the key. */
function ProviderCard({ p }: { p: UploadControlsProps }) {
  return (
    <div className={`svg-provider${p.providerOpen ? "" : " closed"}`} data-testid="upload-provider-card">
      <div className="svg-provider-top">
        <span><strong data-testid="upload-provider">{PROVIDER_NAME}</strong> · metadata generation</span>
        <span data-testid="upload-limits">
          {Math.round(p.gemini.timeoutMs / 1000)}s timeout · {p.gemini.retries} retries · {p.gemini.concurrency} parallel
        </span>
        <button type="button" className="svg-link" data-testid="upload-provider-toggle" aria-expanded={p.providerOpen}
          aria-label={p.providerOpen ? "Minimize provider settings" : "Restore provider settings"}
          onClick={() => p.onProviderOpen(!p.providerOpen)}>{p.providerOpen ? "Minimize" : "Restore"}</button>
      </div>
      {p.providerOpen && (
        <>
          <ProviderFields p={p} />
          <ModelCheckField p={p} />
          <div className="svg-provider-foot">
            <KeyRow keySet={p.keySet} keyMask={p.keyMask} keySource={p.keySource} onSave={p.onSaveKey} onForget={p.onForgetKey} />
          </div>
          <ProviderNote p={p} />
        </>
      )}
    </div>
  );
}

/**
 * The five request settings in one contained grid: short fields share even
 * columns, the endpoint owns a full-width row (it is a URL), and every control
 * keeps its own label — nothing has to overlap to fit (RULE 14).
 */
function ProviderFields({ p }: { p: UploadControlsProps }) {
  return (
    <div className="up-provider-grid" data-testid="upload-provider-grid">
      <label className="svg-field">
        <span className="svg-label">Model</span>
        <input className="svg-input" data-testid="upload-model" aria-label="Gemini model id" spellCheck={false}
          value={p.gemini.model} onChange={(e) => p.onGemini({ model: e.target.value })} />
      </label>
      <label className="svg-field up-field-wide">
        <span className="svg-label">Endpoint</span>
        <input className="svg-input" data-testid="upload-endpoint" aria-label="Gemini base URL" spellCheck={false}
          value={p.gemini.baseUrl} onChange={(e) => p.onGemini({ baseUrl: e.target.value })} />
      </label>
      <NumberField label="Timeout (s)" testid="upload-timeout" value={Math.round(p.gemini.timeoutMs / 1000)}
        min={TIMEOUT_MIN_MS / 1000} max={TIMEOUT_MAX_MS / 1000}
        onChange={(s) => p.onGemini({ timeoutMs: clampTimeoutMs(s * 1000) })} />
      <NumberField label="Retries" testid="upload-retries" value={p.gemini.retries} min={RETRIES_MIN} max={RETRIES_MAX}
        onChange={(n) => p.onGemini({ retries: clampRetries(n) })} />
      <NumberField label="Parallel" testid="upload-concurrency" value={p.gemini.concurrency} min={CONCURRENCY_MIN} max={CONCURRENCY_MAX}
        onChange={(n) => p.onGemini({ concurrency: clampConcurrency(n) })} />
    </div>
  );
}

/**
 * The provider-verified model check (CP-8): one button, one honest line. The
 * configured id is never changed from the provider's answer — a human decides.
 */
function ModelCheckField({ p }: { p: UploadControlsProps }) {
  return (
    <div className="up-provider-check" data-testid="upload-provider-check">
      <button type="button" className="svg-btn" data-testid="upload-model-check" onClick={p.onCheckModel}
        disabled={p.modelCheck.state === "checking"}>
        {p.modelCheck.state === "checking" ? "Checking…" : "Check model"}
      </button>
      <p className="svg-note" data-testid="upload-model-state" data-state={p.modelCheck.state}>
        {p.modelCheck.detail || "checked against the provider's own list — the id is never substituted for you."}
      </p>
    </div>
  );
}

/** The one line of provider honesty: endpoint, auth rule, no auto-uploading. */
function ProviderNote({ p }: { p: UploadControlsProps }) {
  return (
    <p className="svg-note" data-testid="upload-provider-note">
      {generateContentUrl(p.gemini.baseUrl, p.gemini.model || DEFAULT_MODEL)} · the key travels in the
      x-goog-api-key header only — never in a URL, a log or an export · each icon's image is sent
      only inside the one request you confirm · nothing is ever uploaded automatically.
    </p>
  );
}

/** The one text shell for the key slot: copy here, behaviour in `KeySlot`. */
const KEY_TEXT: KeySlotText = { testid: "upload", placeholder: "AIza…", ariaLabel: "Gemini API key" };

function KeyRow({keySet, keyMask, keySource, onSave, onForget}: {
  keySet: boolean; keyMask: string; keySource: KeySource;
  onSave: (k: string) => void; onForget: () => void;
}) {
  const slot = useKeyDraft();
  if (slot.editing) return <KeyEditor {...KEY_TEXT} draft={slot.draft} setDraft={slot.setDraft}
    onSave={onSave} onClose={slot.close} />;
  return <KeySlot {...KEY_TEXT} keySet={keySet} title={keyTitle(keySet, keySource)} mask={keyMask}
    note={keyNote(keySource)} onEdit={slot.open} onForget={onForget} />;
}

/** The one honest headline for the key's state. */
function keyTitle(keySet: boolean, source: KeySource): string {
  if (!keySet) return source === "unreadable" ? "Storage could not be read" : "No Gemini API key yet";
  return source === "session" ? "Gemini key kept for this session only" : "Gemini API key secured locally";
}

/** ...and the one line that says what will happen after a reload. */
function keyNote(source: KeySource): string {
  if (source === "session") return "browser storage refused it — paste again after a reload";
  if (source === "unreadable") return "this device's storage is unreadable here (private mode?)";
  return "stored in IndexedDB · masked in the UI · redacted from logs · excluded from exports";
}

function FilterLine({ p }: { p: UploadControlsProps }) {
  return (
    <div className="svg-filters">
      <Select label="Package" testid="upload-filter-status" value={p.filter.status}
        options={[["all", "All packages"], ["processed", "Processed"], ["partial", "Partial"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["stale", "Stale"], ["not-exported", "Not exported"]]}
        onChange={(v) => p.onFilter({ status: v as UploadListFilter["status"] })} />
      <Select label="Metadata" testid="upload-filter-metadata" value={p.filter.metadata}
        options={[["all", "All metadata"], ["empty", "Empty"], ["pending", "Generating"], ["generated", "Generated"], ["invalid", "Invalid"], ["accepted", "Accepted"], ["interrupted", "Interrupted"]]}
        onChange={(v) => p.onFilter({ metadata: v as UploadListFilter["metadata"] })} />
      <Select label="Sort by" testid="upload-sort" value={p.sort}
        options={[["name", "Filename"], ["status", "Package status"], ["metadata", "Metadata state"]]}
        onChange={(v) => p.onSort(v as UploadSort)} />
      <label className="svg-field">
        <span className="svg-label">Search</span>
        <input className="svg-input" data-testid="upload-search" type="search" aria-label="Search icons"
          placeholder="Filename, folder or version…" value={p.filter.search}
          onChange={(e) => p.onFilter({ search: e.target.value })} />
      </label>
      <span className="svg-result-copy" data-testid="upload-shown">Showing {p.shown} of {p.total}</span>
      <button type="button" className="svg-btn" data-testid="upload-clear-filters" onClick={p.onClearFilters}>× Clear filters</button>
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
