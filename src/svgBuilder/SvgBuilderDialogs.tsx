// SvgBuilderDialogs.tsx — exact-request confirmation and prompt brief. The key
// is masked; no provider call starts until the confirm button is used.
import SvgBuilderBrief from "./SvgBuilderBrief";
import SvgBuilderPresetJson from "./SvgBuilderPresetJson";
import SvgBuilderArtboardMeta from "./SvgBuilderArtboardMeta";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderDialogs({ b }: { b: BuilderApi }) {
  if (b.dialog === "brief") return <SvgBuilderBrief onClose={b.actions.closeDialog} onCopied={b.actions.say} />;
  if (b.dialog === "preset") return <SvgBuilderPresetJson b={b} />;
  if (b.dialog === "artboards-metadata") return <SvgBuilderArtboardMeta b={b} />;
  if (b.dialog !== "metadata") return null;
  return <MetadataDialog b={b} />;
}

function MetadataDialog({ b }: { b: BuilderApi }) {
  return <div className="bld-backdrop" role="presentation">
    <section className="bld-modal" data-testid="builder-meta-dialog" role="dialog"
      aria-modal="true" aria-label="Confirm sheet metadata request">
      <MetadataHead onClose={b.actions.cancelMetadata} />
      <div className="builder-meta-grid">
        <MetadataPreview src={b.preview} />
        <MetadataRequest b={b} />
      </div>
      <MetadataDraft b={b} />
      <MetadataActions b={b} />
    </section>
  </div>;
}

function MetadataHead({ onClose }: { onClose: () => void }) {
  return <div className="bld-modal-head"><div><span className="bld-eyebrow">EXACT REQUEST</span><h3>Confirm before sending</h3></div>
    <button type="button" className="svg-btn ghost tiny" data-testid="builder-meta-close" onClick={onClose}>✕</button></div>;
}

function MetadataPreview({ src }: { src: string | null }) {
  return <figure className="builder-meta-preview-wrap">
    {src !== null
      ? <img className="builder-meta-preview" data-testid="builder-meta-preview" src={src} alt="Exact 768 px sheet JPEG to be sent" />
      : <div className="builder-meta-preview is-empty" data-testid="builder-meta-preview">No preview</div>}
    <figcaption>ONE 768 px JPEG of this exact sheet · no other files or folder contents are sent</figcaption>
  </figure>;
}

function MetadataRequest({ b }: { b: BuilderApi }) {
  return <div className="builder-meta-request">
    <label className="builder-field"><span>PROMPT TO BE SENT</span>
      <textarea className="builder-meta-prompt" data-testid="builder-meta-prompt" readOnly value={b.prompt} /></label>
    <dl className="builder-exact-request" data-testid="builder-exact-request">
      <div><dt>Provider</dt><dd>Gemini</dd></div>
      <div><dt>Model</dt><dd data-testid="builder-meta-model">{b.gemini.model}</dd></div>
      <div><dt>Endpoint</dt><dd>{b.gemini.baseUrl}</dd></div>
      <div><dt>Key</dt><dd data-testid="builder-meta-key">{b.key.mask}</dd></div>
      <div><dt>Retries</dt><dd>none · one request only</dd></div>
    </dl>
    <p className="builder-note" data-testid="builder-meta-send-copy">
      The preview and prompt above are the entire request. The key travels in the header; it is never logged or exported.
    </p>
    <p className="builder-meta-status" data-testid="builder-meta-status">{b.busy ?? b.status}</p>
  </div>;
}

function MetadataDraft({ b }: { b: BuilderApi }) {
  const draft = b.draft;
  if (draft === null) return null;
  return <div className="builder-meta-draft" data-testid="builder-meta-draft">
    <span className="bld-eyebrow">PROVIDER DRAFT · REVIEW BEFORE ACCEPTING</span>
    <h4 data-testid="builder-meta-title">{draft.title}</h4>
    <p data-testid="builder-meta-subtitle">{draft.subtitle}</p>
    <p data-testid="builder-meta-keywords">{draft.keywords.join(" · ")}</p>
    {draft.validation !== null && !draft.validation.ok && <p className="builder-warning">{draft.validation.errors.join(" · ")}</p>}
  </div>;
}

function MetadataActions({ b }: { b: BuilderApi }) {
  return <div className="bld-modal-actions">
    <button type="button" className="svg-btn primary" data-testid="builder-meta-confirm"
      disabled={b.busy !== null} onClick={b.actions.confirmMetadata}>{b.busy !== null ? "Sending…" : "Send this exact request"}</button>
    <button type="button" className="svg-btn" data-testid="builder-meta-accept" disabled={b.draft === null}
      onClick={b.actions.acceptMetadataDraft}>Accept draft</button>
    <button type="button" className="svg-btn ghost tiny" data-testid="builder-meta-cancel" onClick={b.actions.cancelMetadata}>Cancel</button>
  </div>;
}
