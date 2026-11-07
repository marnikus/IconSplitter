// SvgBuilderExportMenu.tsx — the verified delivery controls. Loading a preset
// prunes ids that are no longer approved; nothing is written into the root.
import { useRef, useState } from "react";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderExportMenu({ b }: { b: BuilderApi }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async (file: File | undefined) => {
    if (file === undefined) return;
    setLoading(true);
    try { b.actions.loadPreset(await file.text()); }
    finally { setLoading(false); }
  };
  return <div className="builder-export" data-testid="builder-export" aria-label="Sheet export">
    <span className="builder-export-label">EXPORT</span>
    <button type="button" className="builder-btn" data-testid="builder-export-svg" onClick={b.actions.exportSvg}>⬇ SVG</button>
    <button type="button" className="builder-btn" data-testid="builder-export-png" onClick={b.actions.exportPng}>⬇ PNG</button>
    <button type="button" className="builder-btn" data-testid="builder-export-copy" onClick={b.actions.copySvg}>⧉ Copy SVG</button>
    <button type="button" className="builder-btn" data-testid="builder-export-preset" onClick={b.actions.savePreset}>⬇ Preset</button>
    <button type="button" className="builder-btn" data-testid="builder-export-load" disabled={loading}
      onClick={() => input.current?.click()}>{loading ? "Loading…" : "⇧ Load preset"}</button>
    <input ref={input} className="builder-hidden-input" type="file" accept="application/json,.json"
      aria-label="Load builder preset" onChange={(event) => { void load(event.target.files?.[0]); }} />
  </div>;
}
