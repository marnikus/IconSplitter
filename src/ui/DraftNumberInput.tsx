// DraftNumberInput.tsx — a number field that lets the user finish typing
// (2026-10-19: "do not validate the custom W×H immediately — let the user type,
// then validate when the field is left"). Keystrokes only edit a local draft;
// leaving the field (blur or Enter) commits it once, Escape restores the stored
// value. The owner clamps on commit and the field then shows what was stored.

import { useState, type KeyboardEvent } from "react";

export interface DraftNumberInputProps {
  /** The stored value; null shows an empty field (the placeholder). */
  value: number | null;
  /** Called once on leave with the typed number, or null when the field was emptied. */
  onCommit: (value: number | null) => void;
  testid: string;
  label: string;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
}

export default function DraftNumberInput({ value, onCommit, testid, label, min, max, step, placeholder }: DraftNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null); // null = not editing: show the stored value
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const n = Number(draft);
    if (draft.trim() === "") onCommit(null);
    else if (Number.isFinite(n)) onCommit(n);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") setDraft(null);
  };
  return (
    <input className="svg-input" type="number" data-testid={testid} aria-label={label} min={min} max={max} step={step}
      placeholder={placeholder} value={draft ?? (value === null ? "" : String(value))}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
  );
}
