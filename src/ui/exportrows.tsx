// exportrows.tsx — the pure row components BOTH export-settings dialogs share
// (2026-11-17): a checkbox row, a number row and a select row with the upload
// dialog's exact markup, hints below the control and an optional marker slot.
// The upload dialog wraps them with its scope write path and override markers
// (upload/settingsfield.tsx); the builder dialog wires them straight to its
// own store — one markup, two flows, no drift.
import type { ReactNode } from "react";

interface RowProps {
  label: string;
  hint: string;
  testid: string;
  marker?: ReactNode;
}

export function ExportCheckRow({ label, hint, testid, marker, checked, onChange }: RowProps & {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}{marker}</span>
      <input data-testid={testid} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <small className="up-hint">{hint}</small>
    </label>
  );
}

export function ExportNumberRow({ label, hint, testid, marker, value, min, max, step, onChange }: RowProps & {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}{marker}</span>
      <input className="svg-input" data-testid={testid} type="number" aria-label={label}
        min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <small className="up-hint">{hint}</small>
    </label>
  );
}

export function ExportSelectRow({ label, hint, testid, marker, value, options, onChange }: RowProps & {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}{marker}</span>
      <select className="svg-input" data-testid={testid} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <small className="up-hint">{hint}</small>
    </label>
  );
}
