// KeySlot.tsx — the ONE API-key widget both provider cards use (RULE 16.4).
// The two tabs differ in copy (Gemini / Requesty) and in their testid prefix,
// never in behaviour — so the state button, the Forget button and the editor
// live here once, and neither tab can drift into its own key semantics.
//
// The bug this shape prevents: a Save button that is also "erase the key".
// Save is disabled while the field is empty and the field is cleared on close,
// so an accidental click cannot clear what is stored — deleting a key is the
// separate, deliberate `Forget`.

import { useState } from "react";

export interface KeySlotText {
  /** Testid prefix: `upload` or `svg`. */
  testid: string;
  /** Input placeholder, e.g. `AIza…`. */
  placeholder: string;
  /** Input aria-label, e.g. `Gemini API key`. */
  ariaLabel: string;
}

/** The settled state: what is stored, where, and what a reload will do. */
export function KeySlot({ testid, keySet, title, mask, note, onEdit, onForget }: KeySlotText & {
  keySet: boolean; title: string; mask: string; note: string;
  onEdit: () => void; onForget: () => void;
}) {
  return (
    <span className="svg-key-slot">
      <button type="button" className="svg-key-state" data-testid={`${testid}-key-state`} onClick={onEdit}>
        <span className="svg-key-line">
          <span aria-hidden="true">🛡</span>
          <strong data-testid={`${testid}-key-title`}>{title}</strong>
          <span className="svg-masked" data-testid={`${testid}-key-mask`}>{mask}</span>
        </span>
        <span className="svg-key-note" data-testid={`${testid}-key-note`}>{note}</span>
      </button>
      {keySet && (
        <button type="button" className="svg-btn tiny" data-testid={`${testid}-key-forget`}
          title="Delete the stored key from this device" onClick={onForget}>Forget</button>
      )}
    </span>
  );
}

/** Pasting a key: a draft, an explicit Save, and no way to wipe it by accident. */
export function KeyEditor({ testid, placeholder, ariaLabel, draft, setDraft, onSave, onClose }: KeySlotText & {
  draft: string; setDraft: (v: string) => void; onSave: (k: string) => void; onClose: () => void;
}) {
  const empty = draft.trim() === "";
  const commit = () => {
    onSave(draft);
    onClose();
  };
  return (
    <div className="svg-key-edit">
      <input className="svg-input" data-testid={`${testid}-key-input`} type="password" autoComplete="off" spellCheck={false}
        aria-label={ariaLabel} placeholder={placeholder} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }} />
      <button type="button" className="svg-btn tiny primary" data-testid={`${testid}-key-save`} disabled={empty}
        title={empty ? "Type the key first — an empty field never erases the stored one" : "Save the key on this device"}
        onClick={commit}>Save</button>
      <button type="button" className="svg-btn tiny" data-testid={`${testid}-key-cancel`} onClick={onClose}>Cancel</button>
    </div>
  );
}

/** Local editor state for one key slot: the draft is dropped whenever it closes. */
export function useKeyDraft(): {
  editing: boolean;
  draft: string;
  setDraft: (v: string) => void;
  open: () => void;
  close: () => void;
} {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return {
    editing,
    draft,
    setDraft,
    open: () => setEditing(true),
    close: () => {
      setDraft("");
      setEditing(false);
    },
  };
}
