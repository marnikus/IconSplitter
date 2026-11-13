// SvgBuilderPresetJson.tsx — the "{ } Preset JSON" window (2026-11-13). The
// whole sheet as one editable JSON: colours, sizes, margins, banner text and
// placement, and the icons by Icon Name. Edit it here or paste JSON an AI wrote,
// then Apply: every field it names is set, every field it leaves out keeps the
// sheet's value. "Copy for AI" copies a parameter guide + this JSON + the icon
// names, so an AI can write similar presets to paste back. Then Save template.
import { useEffect, useState } from "react";
import { presetSchemaText } from "../lib/svgBuilder/presetjson";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderPresetJson({ b }: { b: BuilderApi }) {
  const [text, setText] = useState(() => b.actions.presetJsonText());
  // After Apply the box shows the applied sheet — read once the sheet has re-rendered.
  const [resync, setResync] = useState(false);
  useEffect(() => {
    if (!resync) return;
    setResync(false);
    setText(b.actions.presetJsonText());
  }, [resync, b.config, b.checked, b.actions]);
  return <div className="bld-backdrop" role="presentation" onKeyDown={(e) => { if (e.key === "Escape") b.actions.closeDialog(); }}>
    <section className="bld-modal bld-preset-json" data-testid="builder-preset-json" role="dialog" aria-modal="true" aria-label="Preset JSON">
      <div className="bld-modal-head">
        <div><span className="bld-eyebrow">PRESET JSON · EDIT OR PASTE, THEN APPLY</span><h3>Describe the whole sheet in JSON</h3></div>
        <button type="button" className="svg-btn ghost tiny" data-testid="builder-preset-json-close" onClick={b.actions.closeDialog}>✕</button>
      </div>
      <textarea className="bld-preset-json-text" data-testid="builder-preset-json-text" value={text} spellCheck={false}
        aria-label="Preset JSON" onChange={(e) => setText(e.target.value)} />
      <p className={`bld-preset-json-status${b.error ? " is-error" : ""}`} data-testid="builder-preset-json-status" aria-live="polite">{b.status}</p>
      <PresetJsonActions b={b} text={text} onApplied={() => setResync(true)} onRefresh={() => setText(b.actions.presetJsonText())} />
      <details className="bld-preset-json-help" data-testid="builder-preset-json-help">
        <summary>What each parameter means</summary>
        <pre>{presetSchemaText()}</pre>
      </details>
    </section>
  </div>;
}

function PresetJsonActions({ b, text, onApplied, onRefresh }: { b: BuilderApi; text: string; onApplied: () => void; onRefresh: () => void }) {
  return <div className="bld-modal-actions">
    <button type="button" className="svg-btn primary" data-testid="builder-preset-json-apply"
      onClick={() => { if (b.actions.applyPresetJson(text)) onApplied(); }}>Apply to the sheet</button>
    <button type="button" className="svg-btn" data-testid="builder-preset-json-refresh" onClick={onRefresh}
      title="Replace the box with the sheet as it is now">↻ From the sheet</button>
    <button type="button" className="svg-btn" data-testid="builder-preset-json-copy" onClick={() => b.actions.copyPresetJson(text)}>Copy JSON</button>
    <button type="button" className="svg-btn" data-testid="builder-preset-json-copy-ai" onClick={b.actions.copyPresetForAi}
      title="Copies a guide to every parameter, this sheet's JSON and the available Icon Names — paste it to an AI">✦ Copy for AI</button>
    <button type="button" className="svg-btn" data-testid="builder-preset-json-download" onClick={() => b.actions.downloadPresetJson(text)}>⬇ Download .json</button>
  </div>;
}
