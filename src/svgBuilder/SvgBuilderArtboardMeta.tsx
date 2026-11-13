// SvgBuilderArtboardMeta.tsx — the ONE confirmation for the checked artboards'
// metadata (2026-11-13, RULE 20): every exact 768 px JPEG and the prompt that
// will be sent, one request per artboard, no retry. Nothing leaves before
// "Send N exact requests"; the key is masked.
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderArtboardMeta({ b }: { b: BuilderApi }) {
  const plan = b.artboardMeta;
  if (plan === null) return null;
  const n = plan.requests.length;
  return <div className="bld-backdrop" role="presentation">
    <section className="bld-modal bld-artboard-meta" data-testid="builder-artboards-meta-dialog" role="dialog" aria-modal="true" aria-label="Confirm artboard metadata requests">
      <div className="bld-modal-head">
        <div><span className="bld-eyebrow">EXACT REQUESTS · ONE PER ARTBOARD</span><h3>Confirm {n} metadata request{n === 1 ? "" : "s"}</h3></div>
        <button type="button" className="svg-btn ghost tiny" data-testid="builder-artboards-meta-close" disabled={plan.running} onClick={b.actions.cancelArtboardsMetadata}>✕</button>
      </div>
      <div className="bld-artboard-meta-grid">
        {plan.requests.map((r) => <figure key={r.id} data-testid={`builder-artboards-meta-preview-${r.id}`}>
          <img src={r.preview} alt={`Exact 768 px JPEG of ${r.name}`} /><figcaption>{r.name}</figcaption></figure>)}
      </div>
      {plan.skipped.length > 0 && <p className="builder-warning" data-testid="builder-artboards-meta-skipped">Not sent: {plan.skipped.join("; ")}</p>}
      <label className="builder-field"><span>PROMPT SENT WITH EACH IMAGE</span>
        <textarea className="builder-meta-prompt" readOnly value={b.prompt} data-testid="builder-artboards-meta-prompt" /></label>
      <p className="builder-note">Provider Gemini · model {b.gemini.model} · key {b.key.mask} · one request per artboard, no retries. A valid answer is accepted on its artboard.</p>
      <div className="bld-modal-actions">
        <button type="button" className="svg-btn primary" data-testid="builder-artboards-meta-confirm" disabled={plan.running}
          onClick={b.actions.confirmArtboardsMetadata}>{plan.running ? `Sending… ${plan.done}/${n}` : `Send ${n} exact request${n === 1 ? "" : "s"}`}</button>
        <button type="button" className="svg-btn ghost tiny" data-testid="builder-artboards-meta-cancel" disabled={plan.running}
          onClick={b.actions.cancelArtboardsMetadata}>Cancel</button>
      </div>
    </section>
  </div>;
}
