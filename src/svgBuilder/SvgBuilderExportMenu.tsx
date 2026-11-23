// SvgBuilderExportMenu.tsx — the reference "Export ▾" dropdown: Editable SVG ·
// PNG 2× · Copy SVG markup · Export package · Export settings… · Save preset,
// plus our Load preset. Every delivery is verified first; nothing is written
// into the scanned root by the preview items. The package item names the files
// the next export really writes (including EPS and its writer), read from the
// builder's own format store, so a format that is switched off is never
// pretended to be there (2026-11-17).
import { useRef, useState } from "react";
import { CONVERTERS } from "../lib/upload/epsconv/registry";
import { type ExportFormatOptions } from "../lib/exportformats";
import { useDismiss } from "../ui/usedismiss";
import { loadBuilderFormats } from "./formatstore";
import type { BuilderApi } from "./useSvgBuilder";

interface Item { id: string; label: string; hint: string; title?: string; run: () => void }

/** `SVG · PNG · EPS (built-in …)` — or `SVG off` for each format the package will not write (a PNG instead of the JPEG since 2026-11-23). */
export function formatPlan(options: ExportFormatOptions): string {
  const eps = options.includeEps ? `EPS (${CONVERTERS[options.epsConverter].label})` : "EPS off";
  return [options.includeSvg ? "SVG" : "SVG off", options.includeJpeg ? "PNG" : "PNG off", eps].join(" · ");
}

/** The items, in the reference order; `onLoad` opens the hidden preset file input. */
function itemsOf(b: BuilderApi, onLoad: () => void): Item[] {
  const { width, height } = b.config.artboard;
  return [
    { id: "svg", label: "Editable SVG", hint: "Paths, strokes and text", run: b.actions.exportSvg },
    { id: "png", label: "PNG — 2×", hint: `${width * 2} × ${height * 2}px`, run: b.actions.exportPng },
    { id: "copy", label: "Copy SVG markup", hint: "Paste into your design tool", run: b.actions.copySvg },
    { id: "package", label: "Export package", hint: formatPlan(loadBuilderFormats()), title: PACKAGE_TITLE,
      run: b.actions.exportSelectedArtboards },
    { id: "formats", label: "Export settings…", hint: "SVG / PNG / EPS, PNG size, expansion, rescale", run: b.actions.openExportFormats },
    { id: "preset", label: "Save preset", hint: "Settings, text, icons by name (.json)", run: b.actions.savePreset },
    { id: "preset-json", label: "Preset JSON…", hint: "Edit or paste JSON, then apply", run: b.actions.openPresetJson },
    { id: "load", label: "Load preset", hint: "Restore a saved .json preset", run: onLoad },
  ];
}

const PACKAGE_TITLE = "Writes each checked artboard (else the open one) under _artboard_sheets in the folder: "
  + "the ticked SVG, PNG and EPS and export.json";

/** The open menu: the items and its footnote. */
function MenuItems({ b, onLoad, onDone }: { b: BuilderApi; onLoad: () => void; onDone: () => void }) {
  return <div className="bld-menu" role="menu" data-testid="builder-export-menu">
    <div className="svg-field-label"><span>Export sheet</span></div>
    {itemsOf(b, onLoad).map((it) => <button type="button" key={it.id} role="menuitem" className="bld-menu-item"
      data-testid={`builder-export-${it.id}`} title={it.title} onClick={() => { onDone(); it.run(); }}>
      <b>{it.label}</b><span>{it.hint}</span></button>)}
    <p className="bld-hint">Stroke-safe and seed reproducible</p>
  </div>;
}

export default function SvgBuilderExportMenu({ b }: { b: BuilderApi }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  useDismiss(box, open, () => setOpen(false));
  return <div className="bld-export" ref={box} data-testid="builder-export">
    <button type="button" className="svg-btn primary" data-testid="builder-export-toggle" aria-expanded={open} aria-haspopup="menu"
      disabled={b.busy !== null} onClick={() => setOpen(!open)}>⬇ {b.busy === "Preparing…" ? "Preparing…" : "Export"} ▾</button>
    {open && <MenuItems b={b} onLoad={() => file.current?.click()} onDone={() => setOpen(false)} />}
    <input ref={file} className="bld-hidden" type="file" accept="application/json,.json" aria-label="Load builder preset" data-testid="builder-preset-file"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void f.text().then(b.actions.loadPreset); }} />
  </div>;
}
