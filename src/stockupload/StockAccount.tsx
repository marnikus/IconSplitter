import { useState } from "react";
import { connectCompanion, extensionRuntime } from "../lib/stockupload/native";
export default function StockAccount({ disabled }: { disabled: boolean }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function account(op: "save" | "forget" | "receipts" | "reconcile"): Promise<void> {
    const warning = op === "reconcile" ? "Only clear receipts after checking EVERY transferred/uncertain file in the stock portal. This permits duplicate transfers. Have you reconciled them?" : "Run the local companion for this account action? Passwords are kept only in your OS credential store.";
    if (!window.confirm(warning)) return;
    setBusy(true); let client;
    try {
      client = connectCompanion(); await client.hello();
      const result = await client.call(op, op === "save" ? { username, password } : {});
      setStatus(op === "receipts" ? JSON.stringify(result) : "Local account action completed"); await client.call("ack");
    } catch { setStatus("Companion/keychain unavailable, locked or busy. Install/approve the companion locally; no plaintext fallback."); }
    finally { client?.close(); setUsername(""); setPassword(""); setBusy(false); }
  }
  return <details className="stock-account"><summary>Local Shutterstock account & transfer history</summary>
    <fieldset disabled={disabled || busy || !extensionRuntime()}><p>Username and password go only to your OS credential store, not browser storage or exports.</p>
      <label>Username/email <input autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Password <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={!username || !password} onClick={() => void account("save")}>Save locally</button>
      <button onClick={() => void account("forget")}>Forget account</button><button onClick={() => void account("receipts")}>Transfer history</button>
      <button onClick={() => void account("reconcile")}>Clear reconciled history</button>
    </fieldset><p role="status">{status}</p></details>;
}
