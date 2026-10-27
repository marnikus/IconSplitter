import type { ReactNode } from "react";
// fields.tsx — the two form primitives every tab's settings rows reuse (RULE 10):
// a labelled select and a labelled integer input. No rule lives here.
export function Select({ label, testid, value, options, onChange }: {
  label: string; testid: string; value: string; options: [string, string][]; onChange?: (v: string) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">{label}</span>
      <select className="svg-input" data-testid={testid} aria-label={label} value={value}
        onChange={(e) => onChange?.(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

export function NumberField({ label, testid, value, min, max, onChange }: {
  label: string; testid: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">{label}</span>
      <input className="svg-input" data-testid={testid} type="number" min={min} max={max} step={1}
        aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Existing Export settings boolean field, without its workflow write policy. */
export function ToggleField(p: { label: string; checked: boolean; onChange?: (on: boolean) => void; testid?: string; disabled?: boolean; hint?: ReactNode; marker?: ReactNode; title?: string }) {
  return <label className="svg-field up-set-field" title={p.title}>
    <span className="svg-label">{p.label}{p.marker}</span>
    <input data-testid={p.testid} type="checkbox" aria-label={p.label} checked={p.checked} disabled={p.disabled} onChange={e => p.onChange?.(e.target.checked)} />
    <small className="up-hint">{p.hint}</small>
  </label>;
}
interface TextFieldProps {
  label: string; value: string; onChange: (text: string) => void; testid?: string; ariaLabel?: string;
  type?: "search" | "password"; placeholder?: string; autoComplete?: string; spellCheck?: boolean; className?: string;
}
/** The established SVG labelled text input, also used for local account fields. */
export function TextField(p: TextFieldProps) {
  return <label className={`svg-field${p.className ? ` ${p.className}` : ""}`}>
    <span className="svg-label">{p.label}</span>
    <input className="svg-input" data-testid={p.testid} type={p.type} aria-label={p.ariaLabel}
      placeholder={p.placeholder} autoComplete={p.autoComplete} spellCheck={p.spellCheck} value={p.value} onChange={e => p.onChange(e.target.value)} />
  </label>;
}
