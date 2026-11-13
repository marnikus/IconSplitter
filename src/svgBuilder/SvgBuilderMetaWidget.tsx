// SvgBuilderMetaWidget.tsx — the metadata prompt + Gemini widget, right under
// the folder bar (the same panel pair as the SVG to upload tab: the shared
// PromptWindow with saved presets beside the shared Gemini card). It folds to
// one bar, its body can be dragged taller/shorter (height remembered), and
// "Restore height" returns it to its natural height. Generate opens the
// exact-request confirmation; nothing is sent from here.
import type { PointerEvent } from "react";
import PromptWindow from "../ui/PromptWindow";
import { isBuilderDefaultPrompt } from "./promptstore";
import SvgBuilderProviderCard from "./SvgBuilderProviderCard";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderMetaWidget({ b }: { b: BuilderApi }) {
  const { metaOpen, metaHeight } = b.prefs;
  /** The native resize grip writes an inline height; keep it once the drag ends. */
  const keepHeight = (e: PointerEvent<HTMLDivElement>) => {
    const h = parseFloat(e.currentTarget.style.height);
    if (Number.isFinite(h) && Math.round(h) !== metaHeight) b.actions.setMetaHeight(h);
  };
  return <section className="bld-meta-widget" data-testid="builder-meta-widget" data-open={metaOpen} aria-label="Sheet metadata prompt and Gemini">
    <MetaBar b={b} />
    {metaOpen && <div className="bld-meta-body svg-toolbar panels" data-testid="builder-meta-body"
      style={{ height: metaHeight ?? undefined }} onPointerUp={keepHeight}>
      <section className="up-prompt-panel" data-testid="builder-prompt-panel" aria-label="Sheet metadata prompt">
        <PromptWindow testId="builder" label="Metadata prompt" editorClass="up-prompt-editor" text={b.prompt}
          isDefault={isBuilderDefaultPrompt(b.prompt)} presets={[...b.presets]} picked={b.presetPick} onText={b.actions.setPrompt}
          onReset={b.actions.resetPrompt} onPick={b.actions.presets.pickPreset} onQuickLoad={b.actions.presets.quickLoadPreset}
          onDelete={b.actions.presets.deletePreset} onSaveAs={b.actions.presets.savePresetAs} />
        <p className="svg-note" data-testid="builder-prompt-note">
          Stored on this device only; it travels nowhere except inside the one request you confirm. The sheet metadata
          validator still enforces title, subtitle and keyword rules, so an answer that breaks them is refused.
        </p>
      </section>
      <SvgBuilderProviderCard b={b} />
    </div>}
  </section>;
}

function MetaBar({ b }: { b: BuilderApi }) {
  const { metaOpen, metaHeight } = b.prefs;
  const state = b.metadata?.state ?? "empty";
  return <div className="bld-meta-bar">
    <span className="bld-eyebrow">SHEET METADATA PROMPT · GEMINI · {b.gemini.model}</span>
    <span className="bld-meta-state" data-testid="builder-metadata-state" data-state={state}>{state}</span>
    <div className="bld-meta-actions">
      <button type="button" className="svg-btn primary tiny" data-testid="builder-generate-metadata" onClick={b.actions.generateMetadata}>
        Generate sheet metadata…</button>
      {metaOpen && metaHeight !== null && <button type="button" className="svg-link" data-testid="builder-meta-restore-height"
        onClick={() => b.actions.setMetaHeight(null)}>Restore height</button>}
      <button type="button" className="svg-link" data-testid="builder-meta-toggle" aria-expanded={metaOpen}
        aria-label={metaOpen ? "Minimize the metadata widget" : "Restore the metadata widget"}
        onClick={() => b.actions.toggleMeta(!metaOpen)}>{metaOpen ? "Minimize" : "Restore"}</button>
    </div>
  </div>;
}
