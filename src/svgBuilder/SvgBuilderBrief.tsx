// SvgBuilderBrief.tsx — the copy-ready build brief. It documents the exact
// contract without putting a key, prompt bytes or image bytes into any log.
import { useState } from "react";

const BRIEF = `SVG BUILDER — IMPLEMENTATION BRIEF
1. Scope: a seventh Workbench tab named SVG builder; no second app or server.
2. Assets: only .svg.json-approved icons from Generate SVG; recursive all-folder discovery; read-only.
3. Chrome: global top menu, undo bar, full-width folder widget, metadata prompt, shared Gemini card.
4. Theme: dark app chrome, light paper artboard; all controls use local design tokens.
5. Layout: validated pure config, three presets, geometry shared by preview and export.
6. Selection: deterministic seeded recipe, locks, explicit fill, one global selection timeline.
7. Composition: sanitised approved SVG groups, traceability ids, accepted metadata only.
8. Metadata: one explicit, previewed 512px JPEG request; no auto-retry; user accepts the draft.
9. Export: editable SVG, 2x PNG, clipboard and validated JSON preset; no partial downloads.
10. Persistence: config/prefs/prompt/list-view in localStorage; key in the shared IndexedDB vault.
11. Verification: focused TDD contracts, typecheck, lint, changed-file gate, fast/full verify.`;

export default function SvgBuilderBrief({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(BRIEF); setCopied(true); }
    catch { setCopied(false); }
  };
  return <div className="builder-modal-backdrop" role="presentation">
    <section className="builder-modal builder-brief" data-testid="builder-brief-dialog" role="dialog" aria-modal="true"
      aria-label="SVG builder prompt brief">
      <div className="builder-card-head"><div><span className="builder-eyebrow">BRIEF</span><h3>Copy-ready specification</h3></div>
        <button type="button" className="builder-btn subtle" data-testid="builder-brief-close" onClick={onClose}>✕</button></div>
      <pre className="builder-brief-text" data-testid="builder-brief-text">{BRIEF}</pre>
      <div className="builder-modal-actions">
        <button type="button" className="builder-btn accent" data-testid="builder-brief-copy" onClick={() => { void copy(); }}>
          {copied ? "Copied" : "Copy brief"}</button>
        <span className="builder-note" data-testid="builder-brief-copy-status">{copied ? "Copied to clipboard" : "Local clipboard only"}</span>
      </div>
    </section>
  </div>;
}
