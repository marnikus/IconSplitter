// SvgBuilderControls.tsx — full-width folder widget plus metadata prompt and
// shared Gemini card. Split so each component stays inside RULE 16's size cap.
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import PromptWindow from "../ui/PromptWindow";
import { isBuilderDefaultPrompt } from "./promptstore";
import SvgBuilderProviderCard from "./SvgBuilderProviderCard";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderControls({ b }: { b: BuilderApi }) {
  return <div className="builder-controls" data-testid="builder-controls">
    <BuilderFolderWidget b={b} />
    <div className="builder-controls-grid up-columns">
      <BuilderPromptPanel b={b} />
      <SvgBuilderProviderCard b={b} />
    </div>
  </div>;
}

function BuilderFolderWidget({ b }: { b: BuilderApi }) {
  return <section className="builder-folder-widget" data-testid="builder-folder-widget" aria-label="Approved SVG folder">
    <div className="builder-folder-row">
      <span className="builder-plus" aria-hidden="true">＋</span>
      <OpenFolderButton testid="builder-open-folder" onClick={b.actions.openFolder} />
      <button type="button" className="builder-btn" data-testid="builder-rescan" onClick={b.actions.rescan}>↻ Rescan</button>
      <span className="builder-scope-copy" data-testid="builder-scope-copy">Approved SVGs only · all folders · read-only</span>
      <span className="builder-approved-count" data-testid="builder-approved-count">{b.assets.length} approved</span>
      <span className="builder-audit" data-testid="builder-audit">{b.auditLine}</span>
    </div>
    <FolderPathRow root={b.root} testid="builder-folder-path" />
  </section>;
}

function BuilderPromptPanel({ b }: { b: BuilderApi }) {
  return <section className="builder-prompt-panel" data-testid="builder-prompt-panel" aria-label="Sheet metadata prompt">
    <div className="builder-card-head"><div><span className="builder-eyebrow">METADATA</span><h3>One sheet · one brief</h3></div>
      <span className="builder-metadata-state" data-testid="builder-metadata-state" data-state={b.metadata?.state ?? "empty"}>
        {b.metadata?.state ?? "empty"}
      </span></div>
    <PromptWindow testId="builder" label="Sheet metadata prompt" text={b.prompt}
      isDefault={isBuilderDefaultPrompt(b.prompt)} editorClass="builder-prompt-editor"
      presets={[...b.presets]} picked={b.presetPick} onText={b.actions.setPrompt}
      onReset={b.actions.resetPrompt} onPick={b.actions.presets.pickPreset}
      onQuickLoad={b.actions.presets.quickLoadPreset} onDelete={b.actions.presets.deletePreset}
      onSaveAs={b.actions.presets.savePresetAs} />
    <div className="builder-prompt-actions">
      <button type="button" className="builder-btn accent" data-testid="builder-generate-metadata"
        onClick={b.actions.generateMetadata}>Generate sheet metadata</button>
      <button type="button" className="builder-btn" data-testid="builder-brief" onClick={b.actions.openBrief}>Prompt brief</button>
    </div>
  </section>;
}
