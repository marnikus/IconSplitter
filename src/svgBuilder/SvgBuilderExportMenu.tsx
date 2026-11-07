// SvgBuilderExportMenu.tsx — the reference "Export ▾" dropdown ("Export sheet"):
// Editable SVG · PNG 2× · Copy SVG markup · Save preset, plus our Load preset.
// Every delivery is verified first; nothing is written into the scanned root.
import { useRef, useState } from "react";
import { useDismiss } from "../ui/usedismiss";
import type { BuilderApi } from "./useSvgBuilder";

interface Item { id: string; label: string; hint: string; run: () => void }

export default function SvgBuilderExportMenu({ b }: { b: BuilderApi }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  useDismiss(box, open, () => setOpen(false));
  const { width, height } = b.config.artboard;
  const items: Item[] = [
    { id: "svg", label: "Editable SVG", hint: "Paths, strokes and text", run: b.actions.exportSvg },
    { id: "png", label: "PNG — 2×", hint: `${width * 2} × ${height * 2}px`, run: b.actions.exportPng },
    { id: "copy", label: "Copy SVG markup", hint: "Paste into your design tool", run: b.actions.copySvg },
    { id: "preset", label: "Save preset", hint: "Settings, selection and seed", run: b.actions.savePreset },
    { id: "load", label: "Load preset", hint: "Restore a saved .json preset", run: () => file.current?.click() },
  ];
  return <div className="bld-export" ref={box} data-testid="builder-export">
    <button type="button" className="svg-btn primary" data-testid="builder-export-toggle" aria-expanded={open} aria-haspopup="menu"
      disabled={b.busy !== null} onClick={() => setOpen(!open)}>⬇ {b.busy === "Preparing…" ? "Preparing…" : "Export"} ▾</button>
    {open && <div className="bld-menu" role="menu" data-testid="builder-export-menu">
      <div className="svg-field-label"><span>Export sheet</span></div>
      {items.map((it) => <button type="button" key={it.id} role="menuitem" className="bld-menu-item" data-testid={`builder-export-${it.id}`}
        onClick={() => { setOpen(false); it.run(); }}><b>{it.label}</b><span>{it.hint}</span></button>)}
      <p className="bld-hint">Stroke-safe and seed reproducible</p>
    </div>}
    <input ref={file} className="bld-hidden" type="file" accept="application/json,.json" aria-label="Load builder preset" data-testid="builder-preset-file"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void f.text().then(b.actions.loadPreset); }} />
  </div>;
}
