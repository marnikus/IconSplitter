// SvgBuilderFields.tsx — small labelled inputs shared by the inspector. Every
// change produces a complete SheetConfig for the validated history parser.
import type { ReactNode } from "react";

export function NumField({ label, testid, value, min, max, step = 1, onChange }: {
  label: string; testid: string; value: number; min: number; max: number; step?: number;
  onChange: (value: number) => void;
}) {
  return <label className="builder-field"><span>{label}</span><input type="number" data-testid={testid}
    value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

export function TextField({ label, testid, value, onChange }: {
  label: string; testid: string; value: string; onChange: (value: string) => void;
}) {
  return <label className="builder-field"><span>{label}</span><input type="text" data-testid={testid}
    value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

export function ColorField({ label, testid, value, onChange }: {
  label: string; testid: string; value: string; onChange: (value: string) => void;
}) {
  return <label className="builder-field builder-color"><span>{label}</span><input type="color" data-testid={testid}
    value={normalColor(value)} onChange={(e) => onChange(e.target.value)} /><code>{value}</code></label>;
}

export function SelectField({ label, testid, value, options, onChange }: {
  label: string; testid: string; value: string; options: readonly string[]; onChange: (value: string) => void;
}) {
  return <label className="builder-field"><span>{label}</span><select data-testid={testid} value={value}
    onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
}

export function ToggleField({ label, testid, checked, onChange }: {
  label: string; testid: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return <label className="builder-check"><input type="checkbox" data-testid={testid} checked={checked}
    onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

export function InspectorGroup({ title, children }: { title: string; children: ReactNode }) {
  return <details className="builder-inspector-group" open><summary>{title}</summary><div className="builder-inspector-grid">{children}</div></details>;
}

function normalColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value)
    ? `#${value.slice(1).split("").map((c) => c + c).join("")}` : "#ffffff";
}
