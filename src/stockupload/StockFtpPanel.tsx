// StockFtpPanel.tsx — stock FTP/SFTP presets dropdown, per-stock varying fields,
// and local-only non-expanded credentials card (never displays stored secrets).

import { useState } from "react";
import type { FtpProtocol, StockFtpPreset, StockPresetState, TlsPolicy } from "../lib/stockupload/types";
import type { FtpTestStatus, StockFtpActions } from "./ftpactions";

export interface StockFtpPanelProps {
  presetState: StockPresetState;
  ftpOpen: boolean;
  bridgeUrl: string;
  credSaved: Record<string, boolean>;
  testStatus: FtpTestStatus;
  actions: StockFtpActions;
  onToggleOpen: (open: boolean) => void;
  onBridgeUrl: (url: string) => void;
}

export default function StockFtpPanel(p: StockFtpPanelProps) {
  const active = p.presetState.presets.find((s) => s.id === p.presetState.activePresetId) ?? p.presetState.presets[0];
  const saved = Boolean(p.credSaved[active.id]);
  const protoBadge = active.protocol === "sftp" ? "SFTP stock preset" : "FTPS stock preset";
  return (
    <div className={`svg-provider${p.ftpOpen ? "" : " closed"}`} data-testid="stock-ftp-panel">
      <div className="svg-provider-top" style={{ flexWrap: "wrap", gap: 8 }}>
        <span><strong data-testid="stock-ftp-active-name">{active.name}</strong> · {protoBadge}</span>
        <span>{active.host || "no host"}:{active.port} · {active.protocol}</span>
        <QuickPresetSwitch presets={p.presetState.presets} activeId={active.id} ftpOpen={p.ftpOpen}
          actions={p.actions} onToggleOpen={p.onToggleOpen} />
        <button type="button" className="svg-link" data-testid="stock-ftp-toggle" aria-expanded={p.ftpOpen}
          onClick={() => p.onToggleOpen(!p.ftpOpen)}>{p.ftpOpen ? "Minimize" : "Restore"}</button>
      </div>
      {p.ftpOpen && (
        <>
          <PresetSelectorBar presetState={p.presetState} active={active} actions={p.actions} />
          <ConnectionFields active={active} bridgeUrl={p.bridgeUrl} onBridgeUrl={p.onBridgeUrl} actions={p.actions} />
          <LocalCredentialsBox active={active} saved={saved} testStatus={p.testStatus} actions={p.actions} />
        </>
      )}
    </div>
  );
}

function QuickPresetSwitch(p: {
  presets: readonly StockFtpPreset[]; activeId: string; ftpOpen: boolean;
  actions: StockFtpActions; onToggleOpen: (open: boolean) => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="Quick stock preset switch">
      {p.presets.map((pr) => (
        <button key={pr.id} type="button" data-testid={`stock-ftp-quick-${pr.id}`}
          className={`svg-btn tiny${pr.id === p.activeId ? " primary" : ""}`}
          onClick={() => { p.actions.selectPreset(pr.id); if (!p.ftpOpen) p.onToggleOpen(true); }}>{pr.name}</button>
      ))}
    </span>
  );
}

function PresetSelectorBar({ presetState, active, actions }: {
  presetState: StockPresetState; active: StockFtpPreset; actions: StockFtpActions;
}) {
  const [newName, setNewName] = useState("");
  const create = () => {
    actions.addPreset(newName || "Custom Stock");
    setNewName("");
  };
  return (
    <div className="svg-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
      <label className="svg-field">
        <span className="svg-label">Stock website preset</span>
        <select className="svg-input" data-testid="stock-ftp-preset-select" aria-label="Stock website preset"
          value={active.id} onChange={(e) => actions.selectPreset(e.target.value)}>
          {presetState.presets.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </label>
      {active.template !== "custom" ? (
        <button type="button" className="svg-btn tiny" data-testid="stock-ftp-reset-builtin"
          onClick={() => actions.resetBuiltin(active.id)}>↺ Reset {active.name} defaults</button>
      ) : (
        <button type="button" className="svg-btn tiny danger" data-testid="stock-ftp-delete"
          onClick={() => actions.deletePreset(active.id)}>Remove preset</button>
      )}
      <input className="svg-input" type="text" placeholder="New stock name…" aria-label="New stock name"
        data-testid="stock-ftp-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
      <button type="button" className="svg-btn tiny" data-testid="stock-ftp-add" onClick={create}>+ Add stock</button>
    </div>
  );
}

function ConnectionFields({ active, bridgeUrl, onBridgeUrl, actions }: {
  active: StockFtpPreset; bridgeUrl: string; onBridgeUrl: (u: string) => void; actions: StockFtpActions;
}) {
  const patch = (next: Partial<StockFtpPreset>) => actions.updatePreset(active.id, next);
  return (
    <div className="svg-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
      <EndpointFields active={active} onPatch={patch} />
      <SecurityFields active={active} bridgeUrl={bridgeUrl} onBridgeUrl={onBridgeUrl} onPatch={patch} />
    </div>
  );
}

function EndpointFields({ active, onPatch }: {
  active: StockFtpPreset; onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  const hostHint = active.template === "adobe-stock" ? "sftp.contributor.adobestock.com" : "ftps.shutterstock.com";
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Host</span>
        <input className="svg-input" data-testid="stock-ftp-host" value={active.host}
          onChange={(e) => onPatch({ host: e.target.value })} placeholder={hostHint} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Port</span>
        <input className="svg-input" type="number" min={1} max={65535} data-testid="stock-ftp-port"
          value={active.port} onChange={(e) => onPatch({ port: Number(e.target.value) })} />
      </label>
      <ProtocolAndFolderFields active={active} onPatch={onPatch} />
    </>
  );
}

function ProtocolAndFolderFields({ active, onPatch }: {
  active: StockFtpPreset; onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Protocol / Encryption</span>
        <select className="svg-input" data-testid="stock-ftp-protocol" value={active.protocol}
          onChange={(e) => onPatch({ protocol: e.target.value as FtpProtocol })}>
          <option value="ftps-explicit">Explicit FTPS (AUTH TLS :21)</option>
          <option value="sftp">SFTP (SSH :22)</option>
          <option value="ftps-implicit">Implicit FTPS (TLS :990)</option>
          <option value="ftp">Plain FTP (unencrypted)</option>
        </select>
      </label>
      <label className="svg-field">
        <span className="svg-label">Remote folder</span>
        <input className="svg-input" data-testid="stock-ftp-remotedir" value={active.remoteDir}
          onChange={(e) => onPatch({ remoteDir: e.target.value })} />
      </label>
    </>
  );
}

function SecurityFields({ active, bridgeUrl, onBridgeUrl, onPatch }: {
  active: StockFtpPreset; bridgeUrl: string; onBridgeUrl: (u: string) => void;
  onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  const isSftp = active.protocol === "sftp";
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">{isSftp ? "SSH host key check" : "TLS certificate check"}</span>
        <select className="svg-input" data-testid="stock-ftp-tls" value={active.tlsPolicy}
          onChange={(e) => onPatch({ tlsPolicy: e.target.value as TlsPolicy })}>
          <option value="strict">{isSftp ? "Require pinned host key" : "Verify CA certificate"}</option>
          <option value="pinned">Pin server SHA-256 fingerprint</option>
          <option value="accept-self-signed">{isSftp ? "Trust unknown SSH host key" : "Trust unknown server cert"}</option>
        </select>
      </label>
      {active.tlsPolicy === "pinned" && (
        <PinnedFingerprintField value={active.pinnedCertSha256} onPatch={onPatch} />
      )}
      <BridgeUrlField bridgeUrl={bridgeUrl} onBridgeUrl={onBridgeUrl} />
    </>
  );
}

function PinnedFingerprintField({ value, onPatch }: {
  value: string; onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">Pinned SHA-256</span>
      <input className="svg-input" data-testid="stock-ftp-pin" value={value}
        onChange={(e) => onPatch({ pinnedCertSha256: e.target.value })} placeholder="64-hex SHA-256" />
    </label>
  );
}

function BridgeUrlField({ bridgeUrl, onBridgeUrl }: {
  bridgeUrl: string; onBridgeUrl: (u: string) => void;
}) {
  return (
    <label className="svg-field">
      <span className="svg-label">Local FTPS/SFTP helper</span>
      <input className="svg-input" data-testid="stock-ftp-bridge-url" value={bridgeUrl}
        onChange={(e) => onBridgeUrl(e.target.value)} />
    </label>
  );
}

function credentialHelpCopy(active: StockFtpPreset): string {
  if (active.template === "adobe-stock") {
    return "Adobe Stock: in Contributor Portal → Upload → Learn More, copy your SFTP Member ID and click Generate password (standalone SVG/EPS/JPG/PNG only; no ZIPs). Saved locally only — never expanded.";
  }
  return "Username and password are stored ONLY in this browser's local device vault — never expanded, exported, or logged.";
}

function LocalCredentialsBox({ active, saved, testStatus, actions }: {
  active: StockFtpPreset; saved: boolean; testStatus: FtpTestStatus; actions: StockFtpActions;
}) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const onSave = () => {
    void actions.saveCreds(active.id, user, pass).then((ok) => {
      if (ok) { setUser(""); setPass(""); }
    });
  };
  return (
    <div className="svg-provider-foot" data-testid="stock-ftp-cred-box">
      <div className="svg-toolbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <span className={`svg-badge ${saved ? "processed" : "pending"}`} data-testid="stock-ftp-cred-status">
          {saved ? "Saved locally (never expanded)" : "No local credentials"}
        </span>
        <CredentialInputs active={active} saved={saved} user={user} pass={pass} onUser={setUser} onPass={setPass} />
        <CredentialButtons activeId={active.id} saved={saved} canSave={user.trim() !== "" && pass !== ""}
          busy={testStatus.busy} onSave={onSave} actions={actions} />
      </div>
      <TestResultNote active={active} testStatus={testStatus} onTrust={actions.trustPinnedCert} />
      <small className="up-hint">{credentialHelpCopy(active)}</small>
    </div>
  );
}

function CredentialInputs(p: {
  active: StockFtpPreset; saved: boolean; user: string; pass: string;
  onUser: (v: string) => void; onPass: (v: string) => void;
}) {
  const isAdobe = p.active.template === "adobe-stock";
  const userLabel = isAdobe ? "SFTP Member ID" : "Contributor email / username";
  const passLabel = isAdobe ? "Generated SFTP password" : "Password";
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

function TestResultNote({ active, testStatus, onTrust }: {
  active: StockFtpPreset; testStatus: FtpTestStatus; onTrust: (id: string, sha: string) => void;
}) {
  if (testStatus.note === "") return null;
  const keyNoun = active.protocol === "sftp" ? "SSH host key" : "server certificate";
  return (
    <div className="svg-toolbar" style={{ gap: 8 }} data-testid="stock-ftp-test-note">
      <small className={testStatus.ok === false ? "svg-error" : "svg-note"}>{testStatus.note}</small>
      {testStatus.ok === false && testStatus.certSha256 && (
        <button type="button" className="svg-btn tiny" data-testid="stock-ftp-trust-cert"
          onClick={() => onTrust(active.id, testStatus.certSha256!)}>
          Trust & pin {keyNoun} ({testStatus.certSha256.slice(0, 12)}…)
        </button>
      )}
    </div>
  );
}
