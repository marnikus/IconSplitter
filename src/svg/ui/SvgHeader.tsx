// ui/SvgHeader.tsx — approved-source root, exact saved prompt, Requesty model
// controls and key-storage state; API secrets are never displayed here.

import { DEFAULT_MODEL, DEFAULT_PROMPT } from "../prefs";
import { REQUESTY_MODEL_INFO } from "../requesty";
import type { SvgPreferencePatch } from "./useSvgPreferences";

export interface SvgHeaderProps {
  rootName: string;
  eligible: number;
  generated: number;
  reviewed: number;
  failed: number;
  indexing: boolean;
  unreadable: number;
  hasKey: boolean;
  keyBusy: boolean;
  prompt: string;
  model: string;
  imagesPerRequest: number;
  concurrency: number;
  timeoutMs: number;
  retries: number;
  cellSize: number;
  edit: (patch: SvgPreferencePatch, label: string, gesture?: boolean) => boolean;
  onRescan: () => void;
  onChooseRoot: () => void;
  onManageKey: () => void;
  onNotice: (message: string) => void;
}

export default function SvgHeader(p: SvgHeaderProps) {
  return (
    <section className="svg-controls" aria-label="Generate SVG controls">
      <SourceLine p={p} />
      <PromptLine p={p} />
      <RequestLine p={p} />
    </section>
  );
}

function SourceLine({ p }: { p: SvgHeaderProps }) {
  return <div className="svg-source-line"><SourcePicker p={p} /><SourceCounts p={p} /></div>;
}

function SourcePicker({ p }: { p: SvgHeaderProps }) {
  return <div className="svg-root-actions">
    <strong>Approved Selection sources</strong>
    <code title={p.rootName}>{p.rootName || "No source folder selected"}</code>
    <button type="button" className="svg-btn primary" onClick={p.onChooseRoot}>{p.rootName ? "Change folder" : "Choose folder"}</button>
    <button type="button" className="svg-btn" disabled={!p.rootName || p.indexing} onClick={p.onRescan}>
      {p.indexing ? "Scanning…" : "Rescan approved"}
    </button>
    <span className="svg-scope-copy">Recursive · approved AI images only</span>
  </div>;
}

function SourceCounts({ p }: { p: SvgHeaderProps }) {
  return <div className="svg-counters" aria-label="Source counts">
    <Count label="eligible" value={p.eligible} /><Count label="generated" value={p.generated} />
    <Count label="SVG approved" value={p.reviewed} /><Count label="attention" value={p.failed + p.unreadable} warn />
  </div>;
}

function Count({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <span className={warn ? "svg-count warn" : "svg-count"}><b>{value}</b>{label}</span>;
}

function PromptLine({ p }: { p: SvgHeaderProps }) {
  return <div className="svg-prompt-line"><PromptEditor p={p} />
    <div className="svg-prompt-side"><PromptActions p={p} /><RequestyKeyCard p={p} /></div>
  </div>;
}

function PromptEditor({ p }: { p: SvgHeaderProps }) {
  return <label className="svg-prompt-field">
    <span>Generation prompt · saved locally · undoable</span>
    <textarea aria-label="SVG generation prompt" value={p.prompt} maxLength={12_000}
      onChange={(event) => change(p, { prompt: event.target.value }, "Edit SVG generation prompt", true)} />
  </label>;
}

function PromptActions({ p }: { p: SvgHeaderProps }) {
  return <button type="button" className="svg-link" onClick={() => change(p, { prompt: DEFAULT_PROMPT }, "Reset SVG generation prompt")}>
    Reset default
  </button>;
}

function RequestyKeyCard({ p }: { p: SvgHeaderProps }) {
  return <div className="svg-key-card">
    <span>Requesty · OpenAI-compatible</span>
    <button type="button" className="svg-key-state" onClick={p.onManageKey}>
      <b>{p.keyBusy ? "Checking local key…" : p.hasKey ? "Key stored encrypted locally" : "No key saved"}</b>
      <span>{p.hasKey ? "Never shown · excluded from history, sidecars and logs" : "Add key securely"}</span>
    </button>
  </div>;
}

function RequestLine({ p }: { p: SvgHeaderProps }) {
  return (
    <div className="svg-request-line">
      <BasicRequestFields p={p} />
      <AdvancedSettings p={p} />
      <span className="svg-request-safety">Only 429 is retried · uncertain outcomes are never resent</span>
    </div>
  );
}

function BasicRequestFields({ p }: { p: SvgHeaderProps }) {
  return (
    <>
      <label className="svg-field svg-model-field"><span>Requesty model ID</span>
        <input value={p.model} maxLength={200} onChange={(event) => change(p, { model: event.target.value }, "Edit Requesty model", true)} />
      </label>
      <button type="button" className="svg-btn" onClick={() => change(p, { model: DEFAULT_MODEL }, "Reset Requesty model")}>Default model</button>
      <SettingSelect label="Images / request" value={p.imagesPerRequest} values={[1, 2, 3, 4, 6, 9]}
        onChange={(value) => change(p, { imagesPerRequest: value }, "Change SVG batch size")} />
      <SettingSelect label="Concurrent requests" value={p.concurrency} values={[1, 2, 3, 4]}
        onChange={(value) => change(p, { concurrency: value }, "Change SVG request concurrency")} />
      <SettingSelect label="Contact-sheet cell" value={p.cellSize} values={[256, 384, 512, 768, 1024]} suffix="px"
        onChange={(value) => change(p, { cellSize: value }, "Change contact-sheet cell size")} />
    </>
  );
}

function AdvancedSettings({ p }: { p: SvgHeaderProps }) {
  return (
    <details className="svg-settings">
      <summary>Advanced request settings</summary>
      <div className="svg-settings-fields">
        <SettingSelect label="Timeout" value={p.timeoutMs / 1000} values={[30, 60, 90, 120, 180, 300]} suffix="s"
          onChange={(value) => change(p, { timeoutMs: value * 1000 }, "Change Requesty timeout")} />
        <SettingSelect label="Safe 429 retries" value={p.retries} values={[0, 1, 2, 3, 4, 5]}
          onChange={(value) => change(p, { rateLimitRetries: value }, "Change rate-limit retries")} />
        <span className="svg-price-note">Listed upstream rates: ${REQUESTY_MODEL_INFO.inputUsdPerMillion}/M input · ${REQUESTY_MODEL_INFO.outputUsdPerMillion}/M output; Requesty may add 5% pay-as-you-go fees (0% with BYOK). Exact cost comes from Requesty; vision estimates are unavailable.
          <a className="svg-link" href={REQUESTY_MODEL_INFO.source} target="_blank" rel="noreferrer">Model rates</a>
        </span>
      </div>
    </details>
  );
}

function SettingSelect({ label, value, values, suffix = "", onChange }: {
  label: string; value: number; values: number[]; suffix?: string; onChange: (value: number) => void;
}) {
  return (
    <label className="svg-field"><span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {values.map((item) => <option key={item} value={item}>{item}{suffix}</option>)}
      </select>
    </label>
  );
}

function change(p: SvgHeaderProps, patch: SvgPreferencePatch, label: string, gesture = false): void {
  if (!p.edit(patch, label, gesture)) p.onNotice("Credential-like text was blocked and not saved.");
}
