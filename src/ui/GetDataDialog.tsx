// GetDataDialog.tsx — the "Get data" dialog (2026-11-10), shared by every tab:
// four checkboxes (SVG name, PNG name, status, file path), the list they make as
// a live preview, and Copy. The list is separated with commas (lib/getdata).

import { useEffect, useState } from "react";
import { DATA_FIELDS, countData, formatData, type DataField, type DataRow } from "../lib/getdata";
import { getGetDataChoice, setGetDataChoice } from "./getdatachoice";

export interface GetDataDialogProps {
  testid: string;
  rows: readonly DataRow[];
  onClose: () => void;
}

function useEsc(onEsc: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onEsc(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEsc]);
}

/** Copies the list; the note says what happened (never "copied" when the clipboard refused). */
function useCopy(text: string, count: number): { note: string | null; error: string | null; copy: () => void } {
  const [state, setState] = useState<{ note: string | null; error: string | null }>({ note: null, error: null });
  const copy = () => {
    void navigator.clipboard.writeText(text).then(
      () => setState({ note: `Copied ${count} ${count === 1 ? "row" : "rows"}`, error: null }),
      () => setState({ note: null, error: "Could not copy — the browser blocked the clipboard" }),
    );
  };
  return { ...state, copy };
}

export default function GetDataDialog({ testid, rows, onClose }: GetDataDialogProps) {
  const [fields, setFields] = useState<readonly DataField[]>(getGetDataChoice);
  useEsc(onClose);
  const text = formatData(rows, fields);
  const count = countData(rows, fields);
  const copy = useCopy(text, count);
  const toggle = (id: DataField, on: boolean) => {
    const next = on ? [...fields, id] : fields.filter((f) => f !== id);
    setGetDataChoice(next);
    setFields(getGetDataChoice());
  };
  return (
    <div className="svg-backdrop" role="dialog" aria-modal="true" aria-labelledby={`${testid}-get-data-title`}
      data-testid={`${testid}-get-data-dialog`} onClick={onClose}>
      <div className="svg-modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="svg-modal-head">
          <h2 id={`${testid}-get-data-title`}>Get data</h2>
          <button type="button" className="svg-btn ghost tiny" aria-label="Close" data-testid={`${testid}-get-data-close`} onClick={onClose}>✕</button>
        </div>
        <div className="svg-modal-body">
          <p>{rows.length} selected {rows.length === 1 ? "row" : "rows"} — tick what to copy:</p>
          <Choices testid={testid} fields={fields} onToggle={toggle} />
          <Preview testid={testid} text={text} />
          <CopyBar testid={testid} empty={text === ""} copy={copy} />
        </div>
      </div>
    </div>
  );
}

function Preview({ testid, text }: { testid: string; text: string }) {
  return (
    <textarea className="svg-input" readOnly rows={6} value={text} aria-label="The list that will be copied"
      data-testid={`${testid}-get-data-preview`} placeholder="Tick at least one choice" style={{ width: "100%", fontFamily: "monospace" }} />
  );
}

/** Copy, and what happened (never "copied" when the clipboard refused). */
function CopyBar({ testid, empty, copy }: { testid: string; empty: boolean; copy: ReturnType<typeof useCopy> }) {
  return (
    <div className="svg-modal-actions">
      {copy.note !== null && <span className="svg-note" role="status" data-testid={`${testid}-get-data-copied`}>{copy.note}</span>}
      {copy.error !== null && <span className="svg-warning" role="alert" data-testid={`${testid}-get-data-error`}>{copy.error}</span>}
      <button type="button" className="svg-btn primary" data-testid={`${testid}-get-data-copy`} disabled={empty} onClick={copy.copy}>Copy</button>
    </div>
  );
}

function Choices({ testid, fields, onToggle }: { testid: string; fields: readonly DataField[]; onToggle: (id: DataField, on: boolean) => void }) {
  return (
    <div className="svg-field-checks" role="group" aria-label="What to copy">
      {DATA_FIELDS.map((f) => (
        <label key={f.id} className="svg-field-check">
          <input type="checkbox" data-testid={`${testid}-get-data-field-${f.id}`} checked={fields.includes(f.id)} onChange={(e) => onToggle(f.id, e.target.checked)} />
          <span>{f.label}</span>
        </label>
      ))}
    </div>
  );
}
