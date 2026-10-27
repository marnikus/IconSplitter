import { TextField } from "../ui/fields";
import ProviderCardShell from "../ui/ProviderCardShell";
import { useState } from "react";
import { connectCompanion, extensionRuntime } from "../lib/stockupload/native";
import { confirmStockAction } from "./confirmation";
export default function StockAccount({ disabled }: { disabled: boolean }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false);
  async function account(op: "save" | "forget" | "receipts" | "reconcile"): Promise<void> {
    const warning = op === "reconcile" ? "Only clear receipts after checking EVERY transferred/uncertain file in the stock portal. This permits duplicate transfers. Have you reconciled them?" : "Run the local companion for this account action? Passwords are kept only in your OS credential store.";
    if (!await confirmStockAction("Confirm local account action", warning)) return;
    setBusy(true); let client;
    try {
      client = connectCompanion(); await client.hello();
      const result = await client.call(op, op === "save" ? { username, password } : {});
      setStatus(op === "receipts" ? JSON.stringify(result) : "Local account action completed"); await client.call("ack");
    } catch { setStatus("Companion/keychain unavailable, locked or busy. Install/approve the companion locally; no plaintext fallback."); }
    finally { client?.close(); setUsername(""); setPassword(""); setBusy(false); }
  }
  return <ProviderCardShell open={open} onOpen={setOpen} label="Local Shutterstock account & transfer history"
    title={<strong>Local Shutterstock account & transfer history</strong>} toggleTestid="stock-account-toggle" toggleLabel="account settings">
    <fieldset className="up-shadow-fields" disabled={disabled || busy || !extensionRuntime()}><p className="svg-note">Username and password go only to your OS credential store, not browser storage or exports.</p>
      <div className="svg-provider-fields">
        <TextField label="Username/email" autoComplete="off" value={username} onChange={setUsername} />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
      </div>
      <div className="up-bg-row"><button type="button" className="svg-btn tiny" disabled={!username || !password} onClick={() => void account("save")}>Save locally</button>
        <button type="button" className="svg-btn tiny" onClick={() => void account("forget")}>Forget account</button><button type="button" className="svg-btn tiny" onClick={() => void account("receipts")}>Transfer history</button>
        <button type="button" className="svg-btn tiny danger" onClick={() => void account("reconcile")}>Clear reconciled history</button></div>
    </fieldset><p className="svg-note" role="status">{status}</p>
  </ProviderCardShell>;
}
