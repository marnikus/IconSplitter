import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { StockTargetOptions, UploadFormatKey } from "../lib/stockupload/types";
import { setStockPresetState } from "./presetstore";
import type { StockUploadApi } from "./useStockUpload";

const FORMATS: { key: UploadFormatKey; label: string }[] = [
  { key: "raster", label: "JPEG/PNG" }, { key: "svg", label: "SVG" },
  { key: "eps", label: "EPS" }, { key: "zip", label: "ZIP" },
];

export default function StockPresetsPopup({ g }: { g: StockUploadApi }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return <>
    <button type="button" className="svg-btn" data-testid="stock-presets-open"
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Stocks preset</button>
    {open && createPortal(<div className="stock-presets-overlay" onClick={() => setOpen(false)}>
      <section className="stock-presets-dialog" role="dialog" aria-modal="true" aria-labelledby="stock-presets-title"
        data-testid="stock-presets-popup" onClick={(e) => e.stopPropagation()}>
        <header className="stock-presets-header"><div><h2 id="stock-presets-title">Stocks preset</h2>
          <p>Choose upload formats and metadata for each stock.</p></div>
          <button type="button" className="svg-btn" data-testid="stock-presets-close" aria-label="Close stocks preset" onClick={() => setOpen(false)}>✕</button></header>
        <div className="stock-presets-rows">{g.presetState.presets.map((preset) => <PresetRow key={preset.id} g={g} id={preset.id} name={preset.name} />)}</div>
      </section>
    </div>, document.body)}
  </>;
}

function PresetRow({ g, id, name }: { g: StockUploadApi; id: string; name: string }) {
  const state = g.presetState;
  const options = state.targetOptions?.[id] ?? { formats: state.formats, combineTitleDescription: g.model.prefs.combineTitleDescription };
  const update = (next: StockTargetOptions) => setStockPresetState({
    ...state, targetOptions: { ...state.targetOptions, [id]: next },
  });
  return <div className="stock-presets-row" role="group" aria-label={`${name} upload preferences`}>
    <strong className="stock-presets-name">{name}</strong>
    <div className="stock-presets-options">{FORMATS.map(({ key, label }) => <label className="svg-chip" key={key}>
      <input type="checkbox" data-testid={`stock-preset-${id}-${key}`} checked={options.formats[key]}
        onChange={(e) => update({ ...options, formats: { ...options.formats, [key]: e.target.checked } })} />{label}
    </label>)}
      <label className="svg-chip" title="Changes upload copies only, not original files">
        <input type="checkbox" data-testid={`stock-preset-${id}-title-description`} checked={options.combineTitleDescription}
          onChange={(e) => update({ ...options, combineTitleDescription: e.target.checked })} />Title + description
      </label>
    </div>
  </div>;
}
