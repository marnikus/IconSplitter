// ui/SvgKeyDialog.tsx — write-only Requesty credential editor; plaintext exists
// only in the password field and memory for the duration of the save request.

import { useState, type FormEvent } from "react";
import SvgDialog from "./SvgDialog";

export default function SvgKeyDialog({ available, error, onSave, onRemove, onClose }: {
  available: boolean; error: string | null; onSave: (value: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>; onClose: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return <SvgDialog title="Requesty API key" onClose={onClose}>
    <KeyDisclosure />
    <KeyEntryForm secret={secret} setSecret={setSecret} error={error} busy={busy} setBusy={setBusy}
      save={onSave} close={onClose} />
    {available && <RemoveKey available armed={confirmRemove} setArmed={setConfirmRemove} busy={busy} onRemove={onRemove} onClose={onClose} />}
  </SvgDialog>;
}

function KeyDisclosure() {
  return <p className="svg-modal-copy">The key is encrypted with AES-GCM in this browser’s local IndexedDB. It is never shown again, added to undo history, sent in the JSON body, or written to SVG sidecars.</p>;
}

function KeyEntryForm({ secret, setSecret, error, busy, setBusy, save, close }: {
  secret: string; setSecret: (value: string) => void; error: string | null; busy: boolean;
  setBusy: (busy: boolean) => void; save: (value: string) => Promise<boolean>; close: () => void;
}) {
  return <form onSubmit={(event) => void submitKey({ event, secret, save, setBusy, clear: setSecret, close })}>
    <label className="svg-field svg-key-input"><span>Paste API key</span>
      <input type="password" value={secret} autoComplete="new-password" spellCheck={false} maxLength={512}
        aria-label="Requesty API key" onChange={(event) => setSecret(event.target.value)} />
    </label>
    {error && <p role="alert" className="svg-error-copy">{error}</p>}
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" onClick={close}>Cancel</button>
      <button type="submit" className="svg-btn primary" disabled={busy || !secret.trim()}>{busy ? "Saving securely…" : "Save key securely"}</button>
    </div>
  </form>;
}

interface SubmitKeyAction {
  event: FormEvent<HTMLFormElement>; secret: string; save: (value: string) => Promise<boolean>;
  setBusy: (busy: boolean) => void; clear: (value: string) => void; close: () => void;
}

async function submitKey(action: SubmitKeyAction): Promise<void> {
  action.event.preventDefault(); action.setBusy(true);
  const ok = await action.save(action.secret);
  action.clear(""); action.setBusy(false);
  if (ok) action.close();
}

function RemoveKey({ available, armed, setArmed, busy, onRemove, onClose }: {
  available: boolean; armed: boolean; setArmed: (armed: boolean) => void; busy: boolean;
  onRemove: () => Promise<boolean>; onClose: () => void;
}) {
  if (!available) return null;
  return (
    <div className="svg-key-remove">
      <p>A key is already stored. Its value cannot be revealed here.</p>
      <button type="button" className="svg-btn danger" disabled={busy} onClick={() => void removeKey(armed, setArmed, onRemove, onClose)}>
        {armed ? "Confirm remove stored key" : "Remove stored key…"}
      </button>
    </div>
  );
}

async function removeKey(armed: boolean, setArmed: (armed: boolean) => void, remove: () => Promise<boolean>, close: () => void): Promise<void> {
  if (!armed) { setArmed(true); return; }
  if (await remove()) close();
}
