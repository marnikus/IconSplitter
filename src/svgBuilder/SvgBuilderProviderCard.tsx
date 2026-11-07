// SvgBuilderProviderCard.tsx — shared Gemini config/key/model-check card.
// No fetch starts on render; check and metadata are explicit user actions.
import { DEFAULT_GEMINI_CONFIG, PROVIDER_NAME } from "../lib/upload/gemini";
import { KeyEditor, KeySlot, useKeyDraft } from "../ui/KeySlot";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderProviderCard({ b }: { b: BuilderApi }) {
  return <section className="builder-provider-card" data-testid="builder-provider-card" aria-label={`${PROVIDER_NAME} provider`}>
    <ProviderHead b={b} />
    {b.prefs.providerOpen && <ProviderFields b={b} />}
    <ProviderModelState b={b} />
    <ProviderKey b={b} />
    <p className="builder-card-foot">Defaults: {DEFAULT_GEMINI_CONFIG.model} · {DEFAULT_GEMINI_CONFIG.timeoutMs / 1000}s · retries {DEFAULT_GEMINI_CONFIG.retries}. The configured model is never substituted.</p>
  </section>;
}

function ProviderHead({ b }: { b: BuilderApi }) {
  return <div className="builder-card-head">
    <div><span className="builder-eyebrow">PROVIDER</span><h3>{PROVIDER_NAME} sheet metadata</h3></div>
    <button type="button" className="builder-btn subtle" data-testid="builder-provider-toggle"
      aria-expanded={b.prefs.providerOpen}
      onClick={() => b.actions.toggleProvider(!b.prefs.providerOpen)}>{b.prefs.providerOpen ? "−" : "+"}</button>
  </div>;
}

function ProviderFields({ b }: { b: BuilderApi }) {
  return <div className="builder-provider-grid" data-testid="builder-provider-grid">
    <label>MODEL ID <input data-testid="builder-model" value={b.gemini.model}
      onChange={(e) => b.actions.setGemini({ model: e.target.value })} /></label>
    <label>ENDPOINT <input data-testid="builder-endpoint" value={b.gemini.baseUrl}
      onChange={(e) => b.actions.setGemini({ baseUrl: e.target.value })} /></label>
    <label>TIMEOUT (s) <input type="number" min="1" max="120" data-testid="builder-timeout"
      value={Math.round(b.gemini.timeoutMs / 1000)}
      onChange={(e) => b.actions.setGemini({ timeoutMs: Number(e.target.value) * 1000 })} /></label>
    <label>RETRIES <input type="number" min="0" max="5" data-testid="builder-retries"
      value={b.gemini.retries} onChange={(e) => b.actions.setGemini({ retries: Number(e.target.value) })} /></label>
    <label>CONCURRENCY <input type="number" min="1" max="8" data-testid="builder-concurrency"
      value={b.gemini.concurrency} onChange={(e) => b.actions.setGemini({ concurrency: Number(e.target.value) })} /></label>
    <div className="builder-provider-actions">
      <button type="button" className="builder-btn" data-testid="builder-model-check" onClick={b.actions.checkModel}>Check model id</button>
      <span className="builder-provider-fact" data-testid="builder-provider-note">One sheet · one 512px JPEG · no auto-retry</span>
    </div>
  </div>;
}

function ProviderModelState({ b }: { b: BuilderApi }) {
  return <p className="builder-model-state" data-testid="builder-model-state" data-state={b.modelCheck.state}>
    {b.modelCheck.detail === "" ? "Model id not checked yet" : b.modelCheck.detail}
  </p>;
}

function ProviderKey({ b }: { b: BuilderApi }) {
  const { editing, draft, setDraft, open, close } = useKeyDraft();
  const save = (key: string) => { b.actions.saveKey(key.trim()); close(); };
  return editing
    ? <KeyEditor testid="builder" placeholder="AIza…" ariaLabel="Gemini API key"
        draft={draft} setDraft={setDraft} onSave={save} onClose={close} />
    : <KeySlot testid="builder" placeholder="AIza…" ariaLabel="Gemini API key"
        keySet={b.key.keySet} title={b.key.title} note={b.key.note} mask={b.key.mask}
        onEdit={open} onForget={b.actions.forgetKey} />;
}
