// SvgBuilderProviderCard.tsx — the Gemini card, built exactly like the SVG to
// upload tab's (same classes, same fields, same honesty note) over the SHARED
// Gemini config and key vault. No fetch starts on render; Check model and the
// metadata request are explicit user actions.
import {
  CONCURRENCY_MAX, CONCURRENCY_MIN, DEFAULT_MODEL, PROVIDER_NAME, RETRIES_MAX, RETRIES_MIN, TIMEOUT_MAX_MS, TIMEOUT_MIN_MS,
  clampConcurrency, clampRetries, clampTimeoutMs, generateContentUrl,
} from "../lib/upload/gemini";
import { KeyEditor, KeySlot, useKeyDraft } from "../ui/KeySlot";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderProviderCard({ b }: { b: BuilderApi }) {
  const open = b.prefs.providerOpen;
  return <div className={`svg-provider${open ? "" : " closed"}`} data-testid="builder-provider-card">
    <div className="svg-provider-top">
      <span><strong data-testid="builder-provider">{PROVIDER_NAME}</strong> · sheet metadata generation</span>
      <span data-testid="builder-limits">{Math.round(b.gemini.timeoutMs / 1000)}s timeout · {b.gemini.retries} retries · {b.gemini.concurrency} parallel</span>
      <button type="button" className="svg-link" data-testid="builder-provider-toggle" aria-expanded={open}
        aria-label={open ? "Minimize provider settings" : "Restore provider settings"}
        onClick={() => b.actions.toggleProvider(!open)}>{open ? "Minimize" : "Restore"}</button>
    </div>
    {open && <>
      <ProviderFields b={b} />
      <ModelCheck b={b} />
      <div className="svg-provider-foot"><ProviderKey b={b} /></div>
      <p className="svg-note" data-testid="builder-provider-note">
        {generateContentUrl(b.gemini.baseUrl, b.gemini.model || DEFAULT_MODEL)} · the key travels in the x-goog-api-key header only —
        never in a URL, a log or an export · one 768 px JPEG of this sheet is sent only inside the one request you confirm ·
        nothing is ever uploaded automatically.
      </p>
    </>}
  </div>;
}

function ProviderFields({ b }: { b: BuilderApi }) {
  const g = b.gemini;
  return <div className="up-provider-grid" data-testid="builder-provider-grid">
    <label className="svg-field"><span className="svg-label">Model</span>
      <input className="svg-input" data-testid="builder-model" aria-label="Gemini model id" spellCheck={false}
        value={g.model} onChange={(e) => b.actions.setGemini({ model: e.target.value })} /></label>
    <label className="svg-field up-field-wide"><span className="svg-label">Endpoint</span>
      <input className="svg-input" data-testid="builder-endpoint" aria-label="Gemini base URL" spellCheck={false}
        value={g.baseUrl} onChange={(e) => b.actions.setGemini({ baseUrl: e.target.value })} /></label>
    <NumberField label="Timeout (s)" testid="builder-timeout" value={Math.round(g.timeoutMs / 1000)} min={TIMEOUT_MIN_MS / 1000} max={TIMEOUT_MAX_MS / 1000}
      onChange={(s) => b.actions.setGemini({ timeoutMs: clampTimeoutMs(s * 1000) })} />
    <NumberField label="Retries" testid="builder-retries" value={g.retries} min={RETRIES_MIN} max={RETRIES_MAX}
      onChange={(n) => b.actions.setGemini({ retries: clampRetries(n) })} />
    <NumberField label="Parallel" testid="builder-concurrency" value={g.concurrency} min={CONCURRENCY_MIN} max={CONCURRENCY_MAX}
      onChange={(n) => b.actions.setGemini({ concurrency: clampConcurrency(n) })} />
  </div>;
}

function NumberField({ label, testid, value, min, max, onChange }: {
  label: string; testid: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return <label className="svg-field"><span className="svg-label">{label}</span>
    <input className="svg-input" data-testid={testid} type="number" min={min} max={max} step={1} aria-label={label}
      value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function ModelCheck({ b }: { b: BuilderApi }) {
  const checking = b.modelCheck.state === "checking";
  return <div className="up-provider-check" data-testid="builder-provider-check">
    <button type="button" className="svg-btn" data-testid="builder-model-check" disabled={checking} onClick={b.actions.checkModel}>
      {checking ? "Checking…" : "Check model"}</button>
    <p className="svg-note" data-testid="builder-model-state" data-state={b.modelCheck.state}>
      {b.modelCheck.detail || "checked against the provider's own list — the id is never substituted for you."}</p>
  </div>;
}

function ProviderKey({ b }: { b: BuilderApi }) {
  const { editing, draft, setDraft, open, close } = useKeyDraft();
  const save = (key: string) => { b.actions.saveKey(key.trim()); close(); };
  return editing
    ? <KeyEditor testid="builder" placeholder="AIza…" ariaLabel="Gemini API key" draft={draft} setDraft={setDraft} onSave={save} onClose={close} />
    : <KeySlot testid="builder" placeholder="AIza…" ariaLabel="Gemini API key" keySet={b.key.keySet} title={b.key.title}
        note={b.key.note} mask={b.key.mask} onEdit={open} onForget={b.actions.forgetKey} />;
}
