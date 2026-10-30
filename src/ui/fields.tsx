// fields.tsx — the two form primitives every tab's settings rows reuse (RULE 10):
// a labelled select and a labelled integer input. No rule lives here.
export function Select({ label, testid, value, options, onChange }: {
  label: string; testid: string; value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">{label}</span>
      <select className="svg-input" data-testid={testid} aria-label={label} value={value}
        onChange={(e) => onChange(e.target.value)}>
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
