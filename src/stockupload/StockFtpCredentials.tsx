// StockFtpCredentials.tsx — local-only non-expanded credentials card, Getty ESP
// batch-folder readiness bar, OAuth2 PKCE trigger, & connection test banner.

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
  if (active.protocol === "getty-web") {
    return "Getty Images / iStock web upload: the local helper signs in to esp.gettyimages.com/contribute with these saved credentials in a background Chrome/Edge window, click Create Batch once, then hand each JPEG (+ optional EPS) to that page's own uploader. Title/description/tags travel inside the exported files; the batch is created, not submitted for review. Credentials stay in this browser's local device vault — never expanded, exported, or logged. Nothing is sent until you press Upload or Test connection.";
  }
  if (active.protocol === "esp-batch") {
    return "Getty Images / iStock offers no public contributor FTP/SFTP and restricts ESP API keys to approved partners. Click Upload below to stage paired <name>.eps + RGB <name>.jpg + getty_esp_metadata.csv into one flat folder, then drag all files into DeepMeta 4 or esp.gettyimages.com.";
  }
  if (active.protocol === "esp-https") {
    return "Getty ESP Partner API (authentication.gettyimages.com OAuth2 PKCE → api.gettyimages.com:443/esp/submission/v1): requires an approved Getty Partner API key with ESP Submission access. Standard v3 search keys may not have ESP Submission and Ingestion access. Upload creates a contribution; it does not submit it for review.";
  }
  if (active.template === "adobe-stock") {
    return "Adobe Stock: in Contributor Portal → Upload → Learn More, copy your SFTP Member ID and click Generate password (standalone SVG/EPS/JPG/PNG only; no ZIPs). Saved locally only — never expanded.";
  }
  return "Username and password are stored ONLY in this browser's local device vault — never expanded, exported, or logged.";
}

export default function StockFtpCredentials({ active, saved, testStatus, actions }: LocalCredentialsProps) {
  if (active.protocol === "esp-batch") {
    return <EspBatchReadyCard active={active} testStatus={testStatus} actions={actions} />;
  }
  return <NetworkCredentialsCard active={active} saved={saved} testStatus={testStatus} actions={actions} />;
}

function EspBatchReadyCard({ active, testStatus, actions }: {
  active: StockFtpPreset; testStatus: FtpTestStatus; actions: StockFtpActions;
}) {
  return (
    <div className="svg-provider-foot" data-testid="stock-ftp-cred-box">
      <div className="svg-toolbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="svg-badge processed" data-testid="stock-ftp-cred-status">
          Ready locally (no API key or FTP password required)
        </span>
        <button type="button" className="svg-btn tiny" data-testid="stock-ftp-test"
          disabled={testStatus.busy} onClick={() => { void actions.testConnection(active.id); }}>
          {testStatus.busy ? "Checking…" : "Test batch folder"}
        </button>
      </div>
      <TestResultNote active={active} testStatus={testStatus} onTrust={actions.trustPinnedCert} />
      <small className="up-hint">{credentialHelpCopy(active)}</small>
    </div>
  );
}

function NetworkCredentialsCard({ active, saved, testStatus, actions }: LocalCredentialsProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const isEsp = active.protocol === "esp-https";
  const canSave = (user.trim() !== "" && pass !== "") || (isEsp && apiKey.trim() !== "");
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
        {isEsp && <EspApiInputs saved={saved} apiKey={apiKey} apiSecret={apiSecret} onKey={setApiKey} onSecret={setApiSecret} />}
        <LoginInputs active={active} saved={saved} user={user} pass={pass} onUser={setUser} onPass={setPass} />
        <CredentialButtons active={active} saved={saved} canSave={canSave} busy={testStatus.busy}
          onSave={onSave} actions={actions} />
      </div>
      <TestResultNote active={active} testStatus={testStatus} onTrust={actions.trustPinnedCert} />
      <small className="up-hint">{credentialHelpCopy(active)}</small>
    </div>
  );
}

function loginLabels(active: StockFtpPreset): { user: string; pass: string; hint: string } {
  if (active.template === "adobe-stock") return { user: "SFTP Member ID", pass: "Generated SFTP password", hint: "e.g. 210333617" };
  if (active.protocol === "esp-https") return { user: "ESP login (optional with PKCE)", pass: "ESP password (optional)", hint: "Enter username…" };
  if (active.protocol === "getty-web") {
    return { user: "Getty contributor e-mail", pass: "Getty contributor password", hint: "you@example.com" };
  }
  return { user: "Contributor email / username", pass: "Password", hint: "Enter username…" };
}

function LoginInputs(p: {
  active: StockFtpPreset; saved: boolean; user: string; pass: string;
  onUser: (v: string) => void; onPass: (v: string) => void;
}) {
  const labels = loginLabels(p.active);
  const userLabel = labels.user;
  const passLabel = labels.pass;
  const userHint = p.saved ? "Replace saved login…" : labels.hint;
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
        <span className="svg-label">Getty Partner API Key</span>
        <input className="svg-input" type="password" autoComplete="new-password" data-testid="stock-ftp-apikey"
          placeholder={p.saved ? "Replace API key…" : "Enter Getty client_id…"}
          value={p.apiKey} onChange={(e) => p.onKey(e.target.value)} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Getty API Secret</span>
        <input className="svg-input" type="password" autoComplete="new-password" data-testid="stock-ftp-apisecret"
          placeholder={p.saved ? "Replace API secret…" : "Enter client_secret (if confidential)…"}
          value={p.apiSecret} onChange={(e) => p.onSecret(e.target.value)} />
      </label>
    </>
  );
}

function CredentialButtons(p: {
  active: StockFtpPreset; saved: boolean; canSave: boolean; busy: boolean;
  onSave: () => void; actions: StockFtpActions;
}) {
  return (
    <>
      <button type="button" className="svg-btn tiny primary" data-testid="stock-ftp-cred-save"
        disabled={!p.canSave} onClick={p.onSave}>Save locally</button>
      {p.saved && (
        <button type="button" className="svg-btn tiny danger" data-testid="stock-ftp-cred-forget"
          onClick={() => { void p.actions.forgetCreds(p.active.id); }}>Forget</button>
      )}
      {p.active.protocol === "esp-https" && (
        <button type="button" className="svg-btn tiny" data-testid="stock-esp-oauth"
          disabled={!p.saved} onClick={() => { void p.actions.authorizeEspOAuth(p.active.id); }}>
          🔑 Authorize in Browser (OAuth2 PKCE)
        </button>
      )}
      <button type="button" className="svg-btn tiny" data-testid="stock-ftp-test"
        disabled={p.busy} onClick={() => { void p.actions.testConnection(p.active.id); }}>
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
