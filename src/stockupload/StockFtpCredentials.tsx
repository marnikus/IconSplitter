// StockFtpCredentials.tsx — local-only non-expanded credentials card & connection
// test status banner for FTPS (:21), SFTP (:22), and Getty ESP HTTPS (:443).

import { useState } from "react";
import type { StockFtpPreset } from "../lib/stockupload/types";
import type { FtpTestStatus, StockFtpActions } from "./ftpactions";

export interface LocalCredentialsProps {
  active: StockFtpPreset;
  saved: boolean;
  testStatus: FtpTestStatus;
  actions: StockFtpActions;
}

function credentialHelpCopy(active: StockFtpPreset): string {
  if (active.template === "adobe-stock") {
    return "Adobe Stock: in Contributor Portal → Upload → Learn More, copy your SFTP Member ID and click Generate password (standalone SVG/EPS/JPG/PNG only; no ZIPs). Saved locally only — never expanded.";
  }
  if (active.template === "getty-images") {
    return "Getty Images / iStock (contributors.gettyimages.com → esp.gettyimages.com): Creative vectors require paired <name>.eps + RGB <name>.jpg (min 1900×2800 px). Use Getty ESP HTTPS API (:443), switch to SFTP (:22) for Media Manager DAM, or click Download ESP CSV for browser/DeepMeta uploads. Saved locally only — never expanded.";
  }
  return "Username and password are stored ONLY in this browser's local device vault — never expanded, exported, or logged.";
}

export default function StockFtpCredentials({ active, saved, testStatus, actions }: LocalCredentialsProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const onSave = () => {
    void actions.saveCreds(active.id, user, pass, { apiKey, apiSecret }).then((ok) => {
      if (ok) { setUser(""); setPass(""); setApiKey(""); setApiSecret(""); }
    });
  };
  return (
    <div className="svg-provider-foot" data-testid="stock-ftp-cred-box">
      <div className="svg-toolbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <span className={`svg-badge ${saved ? "processed" : "pending"}`} data-testid="stock-ftp-cred-status">
          {saved ? "Saved locally (never expanded)" : "No local credentials"}
        </span>
        <LoginInputs active={active} saved={saved} user={user} pass={pass} onUser={setUser} onPass={setPass} />
        {active.protocol === "esp-https" && (
          <EspApiInputs saved={saved} apiKey={apiKey} apiSecret={apiSecret} onKey={setApiKey} onSecret={setApiSecret} />
        )}
        <CredentialButtons activeId={active.id} saved={saved} canSave={user.trim() !== "" && pass !== ""}
          busy={testStatus.busy} onSave={onSave} actions={actions} />
      </div>
      <TestResultNote active={active} testStatus={testStatus} onTrust={actions.trustPinnedCert} />
      <small className="up-hint">{credentialHelpCopy(active)}</small>
    </div>
  );
}

function LoginInputs(p: {
  active: StockFtpPreset; saved: boolean; user: string; pass: string;
  onUser: (v: string) => void; onPass: (v: string) => void;
}) {
  const isAdobe = p.active.template === "adobe-stock";
  const isEsp = p.active.protocol === "esp-https";
  const userLabel = isAdobe ? "SFTP Member ID" : (isEsp ? "ESP contributor email / login" : "Contributor email / username");
  const passLabel = isAdobe ? "Generated SFTP password" : (isEsp ? "ESP password" : "Password");
  const userHint = p.saved ? "Replace saved login…" : (isAdobe ? "e.g. 210333617" : "Enter username…");
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">{userLabel}</span>
        <input className="svg-input" type="text" autoComplete="off" data-testid="stock-ftp-user"
          placeholder={userHint} value={p.user} onChange={(e) => p.onUser(e.target.value)} />
      </label>
      <label className="svg-field">
        <span className="svg-label">{passLabel}</span>
        <input className="svg-input" type="password" autoComplete="new-password" data-testid="stock-ftp-pass"
          placeholder={p.saved ? "Replace saved password…" : "Enter password…"}
          value={p.pass} onChange={(e) => p.onPass(e.target.value)} />
      </label>
    </>
  );
}

function EspApiInputs(p: {
  saved: boolean; apiKey: string; apiSecret: string;
  onKey: (v: string) => void; onSecret: (v: string) => void;
}) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Getty API Key</span>
        <input className="svg-input" type="password" autoComplete="new-password" data-testid="stock-ftp-apikey"
          placeholder={p.saved ? "Replace API key…" : "Optional ESP client_id…"}
          value={p.apiKey} onChange={(e) => p.onKey(e.target.value)} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Getty API Secret</span>
        <input className="svg-input" type="password" autoComplete="new-password" data-testid="stock-ftp-apisecret"
          placeholder={p.saved ? "Replace API secret…" : "Optional ESP client_secret…"}
          value={p.apiSecret} onChange={(e) => p.onSecret(e.target.value)} />
      </label>
    </>
  );
}

function CredentialButtons(p: {
  activeId: string; saved: boolean; canSave: boolean; busy: boolean;
  onSave: () => void; actions: StockFtpActions;
}) {
  return (
    <>
      <button type="button" className="svg-btn tiny primary" data-testid="stock-ftp-cred-save"
        disabled={!p.canSave} onClick={p.onSave}>Save locally</button>
      {p.saved && (
        <button type="button" className="svg-btn tiny danger" data-testid="stock-ftp-cred-forget"
          onClick={() => { void p.actions.forgetCreds(p.activeId); }}>Forget</button>
      )}
      <button type="button" className="svg-btn tiny" data-testid="stock-ftp-test"
        disabled={p.busy} onClick={() => { void p.actions.testConnection(p.activeId); }}>
        {p.busy ? "Testing…" : "Test connection"}
      </button>
    </>
  );
}

function testBannerPresentation(s: FtpTestStatus): { tone: string; label: string } | null {
  if (s.busy) return { tone: "busy", label: `⟳ ${s.note || "Testing connection…"}` };
  if (s.ok === true) return { tone: "ok", label: `✓ ${s.note || "Connected"}` };
  if (s.ok === false || s.note !== "") return { tone: "err", label: `✕ ${s.note || "Connection failed"}` };
  return null;
}

function TestResultNote({ active, testStatus, onTrust }: {
  active: StockFtpPreset; testStatus: FtpTestStatus; onTrust: (id: string, sha: string) => void;
}) {
  const banner = testBannerPresentation(testStatus);
  if (!banner) return null;
  const keyNoun = active.protocol === "sftp" ? "SSH host key" : "server certificate";
  return (
    <div className={`stock-test-banner ${banner.tone}`} role="status" data-testid="stock-ftp-test-note">
      <span>{banner.label}</span>
      {testStatus.ok === false && testStatus.certSha256 && (
        <button type="button" className="svg-btn tiny primary" data-testid="stock-ftp-trust-cert"
          onClick={() => onTrust(active.id, testStatus.certSha256!)}>
          Trust & pin {keyNoun} ({testStatus.certSha256.slice(0, 12)}…) & connect
        </button>
      )}
    </div>
  );
}
