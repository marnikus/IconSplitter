// SvgBuilderMetaSetup.tsx — "Sheet metadata" dialog (our addition; the
// reference has no provider): the editable metadata prompt with presets, the
// shared Gemini provider card, and Generate, which opens the exact-request
// confirmation. Nothing is sent from here.
import PromptWindow from "../ui/PromptWindow";
import { isBuilderDefaultPrompt } from "./promptstore";
import SvgBuilderProviderCard from "./SvgBuilderProviderCard";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderMetaSetup({ b }: { b: BuilderApi }) {
  return <div className="bld-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) b.actions.closeDialog(); }}>
    <section className="bld-modal" data-testid="builder-meta-setup" role="dialog" aria-modal="true" aria-label="Sheet metadata">
      <div className="bld-modal-head">
        <div><span className="bld-eyebrow">SHEET METADATA · GEMINI</span><h3>One sheet · one brief</h3></div>
        <button type="button" className="svg-btn ghost tiny" data-testid="builder-meta-setup-close" aria-label="Close" onClick={b.actions.closeDialog}>✕</button>
      </div>
      <div className="bld-meta-setup-grid">
        <section className="bld-card" data-testid="builder-prompt-panel" aria-label="Sheet metadata prompt">
          <PromptWindow testId="builder" label="Sheet metadata prompt" text={b.prompt} isDefault={isBuilderDefaultPrompt(b.prompt)}
            editorClass="builder-prompt-editor" presets={[...b.presets]} picked={b.presetPick} onText={b.actions.setPrompt}
            onReset={b.actions.resetPrompt} onPick={b.actions.presets.pickPreset} onQuickLoad={b.actions.presets.quickLoadPreset}
            onDelete={b.actions.presets.deletePreset} onSaveAs={b.actions.presets.savePresetAs} />
        </section>
        <SvgBuilderProviderCard b={b} />
      </div>
      <div className="bld-modal-actions">
        <button type="button" className="svg-btn primary" data-testid="builder-generate-metadata" onClick={b.actions.generateMetadata}>
          Generate sheet metadata…</button>
        <span className="bld-hint">Next step shows the exact request (one 768 px JPEG of this sheet + this prompt) before anything is sent.</span>
      </div>
    </section>
  </div>;
}
