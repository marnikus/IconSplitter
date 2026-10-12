// SelectField.tsx — select field for Batch filter

import Field from "./Field";

export default function SelectField({
  label,
  testid,
  value,
  onChange,
  options,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Field label={label}>
      <select className="v2-input" data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}
