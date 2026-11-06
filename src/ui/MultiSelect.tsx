// MultiSelect.tsx — the one filter dropdown of every list tab (2026-11-06): a
// button that says what is picked ("Generating + Generated") and a menu with
// one checkbox per option. The FIRST option is the "all" value (no filter).
// Handles: `<testid>` (button), `<testid>-menu`, `<testid>-opt-<value>`. The
// rules live in lib/multifilter; this only draws them.

import { useRef, useState } from "react";
import { useDismiss } from "./usedismiss";
import { multiText, pickedOf, toggleMulti, type Multi } from "../lib/multifilter";

export interface MultiSelectProps {
  label: string;
  testid: string;
  value: Multi<string> | undefined;
  /** [value, text] pairs; the first one is "all". */
  options: readonly (readonly [string, string])[];
  onChange: (next: Multi<string>) => void;
  look?: "svg" | "v2";
}

export default function MultiSelect(p: MultiSelectProps) {
  const look = p.look ?? "svg";
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(box, open, close);
  const [all, allText] = p.options[0];
  const values = p.options.slice(1).map(([v]) => v);
  const textOf = (v: string) => p.options.find(([o]) => o === v)?.[1] ?? v;
  const summary = multiText(p.value, all, textOf) || allText;
  return (
    <div className={`${look}-field multi-select`} ref={box}>
      <span className={`${look}-label`}>{p.label}</span>
      <button type="button" className={`${look}-input multi-select-trigger`} data-testid={p.testid}
        aria-label={p.label} aria-haspopup="listbox" aria-expanded={open} title={summary}
        onClick={() => setOpen((o) => !o)}>
        <span className="multi-select-text">{summary}</span><span aria-hidden="true">▾</span>
      </button>
      <OptionMenu p={p} hidden={!open} all={all} values={values} />
    </div>
  );
}

function OptionMenu({ p, hidden, all, values }: { p: MultiSelectProps; hidden: boolean; all: string; values: string[] }) {
  const picked = new Set(pickedOf(p.value, all));
  const pick = (v: string) => p.onChange(v === all ? all : toggleMulti(p.value ?? all, v, all, values));
  return (
    <div className="multi-select-menu" role="listbox" aria-multiselectable="true" aria-label={p.label}
      data-testid={`${p.testid}-menu`} hidden={hidden}>
      {p.options.map(([v, text]) => (
        <label key={v} role="option" aria-selected={v === all ? picked.size === 0 : picked.has(v)}
          className={`multi-select-option${v === all ? " all" : ""}`}>
          <input type="checkbox" data-testid={`${p.testid}-opt-${v}`}
            checked={v === all ? picked.size === 0 : picked.has(v)} onChange={() => pick(v)} />
          <span>{text}</span>
        </label>
      ))}
    </div>
  );
}
