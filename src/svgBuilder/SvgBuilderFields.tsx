// SvgBuilderFields.tsx — the reference's control set (collapsible section with
// badge, px number box, stepper, slider with value pill, swatches, colour chip,
// switch, segmented, select, text) built from the app's own classes and tokens.
import { useState, type ReactNode } from "react";
import { clampTo, type NumRange } from "../lib/svgBuilder/ranges";
import { SWATCHES } from "../lib/svgBuilder/config";
import DraftNumberInput from "../ui/DraftNumberInput";

export function Section({ title, badge, initiallyOpen = true, testid, children }: {
  title: string; badge?: string; initiallyOpen?: boolean; testid: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return <section className="bld-section" data-testid={testid} data-open={open}>
    <button type="button" className="bld-section-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="bld-section-title">{title}</span>
      {badge !== undefined && <span className="bld-badge">{badge}</span>}
      <span className="bld-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
    </button>
    {open && <div className="bld-section-body">{children}</div>}
  </section>;
}

export function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return <div className="bld-field"><div className="svg-field-label"><span>{label}</span>{aside}</div>{children}</div>;
}

export function NumBox({ label, unit, value, range, testid, onCommit }: {
  label: string; unit?: string; value: number; range: NumRange; testid: string; onCommit: (v: number) => void;
}) {
  return <label className="bld-numbox"><span className="bld-numbox-label">{label}</span>
    <DraftNumberInput testid={testid} label={label} value={value} min={range.min} max={range.max} step={range.step}
      onCommit={(v) => { if (v !== null) onCommit(clampTo(range, v)); }} />
    {unit !== undefined && <span className="bld-unit">{unit}</span>}</label>;
}

export function Stepper({ label, value, range, testid, onChange }: {
  label: string; value: number; range: NumRange; testid: string; onChange: (v: number) => void;
}) {
  return <div className="bld-stepper" data-testid={testid} aria-label={label}>
    <button type="button" className="svg-btn tiny" data-testid={`${testid}-dec`} aria-label={`Fewer ${label}`}
      disabled={value <= range.min} onClick={() => onChange(clampTo(range, value - range.step))}>−</button>
    <span className="bld-stepper-value" data-testid={`${testid}-value`}>{value}</span>
    <button type="button" className="svg-btn tiny" data-testid={`${testid}-inc`} aria-label={`More ${label}`}
      disabled={value >= range.max} onClick={() => onChange(clampTo(range, value + range.step))}>+</button>
  </div>;
}

export function Slider({ label, value, range, unit = "", testid, onChange, display }: {
  label: string; value: number; range: NumRange; unit?: string; testid: string;
  onChange: (v: number) => void; display?: string;
}) {
  const decimals = range.step < 1 ? 1 : 0;
  return <Field label={label} aside={<span className="bld-pill" data-testid={`${testid}-value`}>{display ?? `${value.toFixed(decimals)}${unit}`}</span>}>
    <input type="range" className="bld-range" data-testid={testid} aria-label={label} min={range.min} max={range.max} step={range.step}
      value={value} onChange={(e) => onChange(clampTo(range, Number(e.target.value)))} />
  </Field>;
}

export function Swatches({ label, value, testid, onChange }: { label: string; value: string; testid: string; onChange: (v: string) => void }) {
  return <Field label={label} aside={<code className="bld-hex">{value}</code>}>
    <div className="bld-swatches" data-testid={testid}>
      <input type="color" className="bld-picker" aria-label={`${label} colour`} data-testid={`${testid}-picker`}
        value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      {SWATCHES.map((hex) => <button type="button" key={hex} className={`bld-swatch${hex === value ? " is-on" : ""}`}
        style={{ background: hex }} aria-label={hex} aria-pressed={hex === value} data-testid={`${testid}-${hex.slice(1)}`}
        onClick={() => onChange(hex)} />)}
    </div>
  </Field>;
}

export function ColorChip({ label, value, testid, onChange }: { label: string; value: string; testid: string; onChange: (v: string) => void }) {
  return <label className="bld-chip-color">
    <input type="color" data-testid={testid} aria-label={label} value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} />
    <span>{label}</span><code className="bld-hex">{value}</code>
  </label>;
}

export function Toggle({ label, hint, checked, testid, onChange }: {
  label: string; hint?: string; checked: boolean; testid: string; onChange: (v: boolean) => void;
}) {
  return <div className="bld-toggle-row">
    <div><div className="bld-toggle-label">{label}</div>{hint !== undefined && <div className="bld-hint">{hint}</div>}</div>
    <button type="button" role="switch" aria-checked={checked} aria-label={label} data-testid={testid}
      className={`bld-switch${checked ? " is-on" : ""}`} onClick={() => onChange(!checked)}><span /></button>
  </div>;
}

export interface SegOption<T extends string> { value: T; label: string; title?: string }

export function Segmented<T extends string>({ options, value, testid, onChange, label }: {
  options: readonly SegOption<T>[]; value: T; testid: string; onChange: (v: T) => void; label: string;
}) {
  return <div className="v2-date-tabs bld-seg" role="radiogroup" aria-label={label} data-testid={testid}>
    {options.map((o) => <button type="button" key={o.value} role="radio" aria-checked={o.value === value} title={o.title}
      className={o.value === value ? "active" : ""} data-testid={`${testid}-${o.value}`} onClick={() => onChange(o.value)}>{o.label}</button>)}
  </div>;
}

export function TextBox({ label, value, placeholder, testid, onChange }: {
  label: string; value: string; placeholder?: string; testid: string; onChange: (v: string) => void;
}) {
  return <Field label={label}><input type="text" className="svg-input" data-testid={testid} aria-label={label}
    value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></Field>;
}
