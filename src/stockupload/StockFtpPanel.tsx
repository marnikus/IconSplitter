// StockFtpPanel.tsx — stock FTPS/SFTP/ESP presets dropdown, per-stock varying
// fields, Getty ESP CSV export, and local-only non-expanded credentials card.

import { useState } from "react";
import type { FtpProtocol, StockFtpPreset, StockPresetState, TlsPolicy } from "../lib/stockupload/types";
import StockFtpCredentials from "./StockFtpCredentials";
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
  onDownloadGettyCsv?: () => void;
}

function protocolBadgeCopy(protocol: FtpProtocol): string {
  if (protocol === "esp-https") return "Getty ESP HTTPS preset";
  return protocol === "sftp" ? "SFTP stock preset" : "FTPS stock preset";
}

export default function StockFtpPanel(p: StockFtpPanelProps) {
  const active = p.presetState.presets.find((s) => s.id === p.presetState.activePresetId) ?? p.presetState.presets[0];
  const saved = Boolean(p.credSaved[active.id]);
  return (
    <div className={`svg-provider${p.ftpOpen ? "" : " closed"}`} data-testid="stock-ftp-panel">
      <div className="svg-provider-top" style={{ flexWrap: "wrap", gap: 8 }}>
        <span><strong data-testid="stock-ftp-active-name">{active.name}</strong> · {protocolBadgeCopy(active.protocol)}</span>
        <span>{active.host || "no host"}:{active.port} · {active.protocol}</span>
        <QuickPresetSwitch presets={p.presetState.presets} activeId={active.id} ftpOpen={p.ftpOpen}
          actions={p.actions} onToggleOpen={p.onToggleOpen} />
        <button type="button" className="svg-link" data-testid="stock-ftp-toggle" aria-expanded={p.ftpOpen}
          onClick={() => p.onToggleOpen(!p.ftpOpen)}>{p.ftpOpen ? "Minimize" : "Restore"}</button>
      </div>
      {p.ftpOpen && (
        <>
          <PresetSelectorBar presetState={p.presetState} active={active} actions={p.actions}
            onDownloadGettyCsv={p.onDownloadGettyCsv} />
          <ConnectionFields active={active} bridgeUrl={p.bridgeUrl} onBridgeUrl={p.onBridgeUrl} actions={p.actions} />
          <StockFtpCredentials active={active} saved={saved} testStatus={p.testStatus} actions={p.actions} />
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

function PresetSelectorBar({ presetState, active, actions, onDownloadGettyCsv }: {
  presetState: StockPresetState; active: StockFtpPreset; actions: StockFtpActions;
  onDownloadGettyCsv?: () => void;
}) {
  return (
    <div className="svg-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
      <label className="svg-field">
        <span className="svg-label">Stock website preset</span>
        <select className="svg-input" data-testid="stock-ftp-preset-select" aria-label="Stock website preset"
          value={active.id} onChange={(e) => actions.selectPreset(e.target.value)}>
          {presetState.presets.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </label>
      <PresetActionButtons active={active} actions={actions} onDownloadGettyCsv={onDownloadGettyCsv} />
      <NewPresetField onAdd={actions.addPreset} />
    </div>
  );
}

function PresetActionButtons({ active, actions, onDownloadGettyCsv }: {
  active: StockFtpPreset; actions: StockFtpActions; onDownloadGettyCsv?: () => void;
}) {
  return (
    <>
      {active.template !== "custom" ? (
        <button type="button" className="svg-btn tiny" data-testid="stock-ftp-reset-builtin"
          onClick={() => actions.resetBuiltin(active.id)}>↺ Reset {active.name} defaults</button>
      ) : (
        <button type="button" className="svg-btn tiny danger" data-testid="stock-ftp-delete"
          onClick={() => actions.deletePreset(active.id)}>Remove preset</button>
      )}
      {active.template === "getty-images" && onDownloadGettyCsv && (
        <button type="button" className="svg-btn tiny" data-testid="stock-getty-csv" onClick={onDownloadGettyCsv}>
          ⇩ Download ESP CSV
        </button>
      )}
    </>
  );
}

function NewPresetField({ onAdd }: { onAdd: (name: string) => void }) {
  const [newName, setNewName] = useState("");
  const create = () => { onAdd(newName || "Custom Stock"); setNewName(""); };
  return (
    <>
      <input className="svg-input" type="text" placeholder="New stock name…" aria-label="New stock name"
        data-testid="stock-ftp-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
      <button type="button" className="svg-btn tiny" data-testid="stock-ftp-add" onClick={create}>+ Add stock</button>
    </>
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

function defaultHostHint(active: StockFtpPreset): string {
  if (active.template === "adobe-stock") return "sftp.contributor.adobestock.com";
  return active.template === "getty-images" ? "api.gettyimages.com" : "ftps.shutterstock.com";
}

function EndpointFields({ active, onPatch }: {
  active: StockFtpPreset; onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Host</span>
        <input className="svg-input" style={{ minWidth: 250 }} data-testid="stock-ftp-host" value={active.host}
          onChange={(e) => onPatch({ host: e.target.value })} placeholder={defaultHostHint(active)} />
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
  const sftpOnly = active.template === "adobe-stock";
  const dirLabel = active.protocol === "esp-https" ? "ESP batches endpoint / ID" : "Remote folder";
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Protocol / Encryption</span>
        <select className="svg-input" data-testid="stock-ftp-protocol" value={active.protocol}
          disabled={sftpOnly} onChange={(e) => onPatch({ protocol: e.target.value as FtpProtocol })}>
          {!sftpOnly && <option value="ftps-explicit">Explicit FTPS (AUTH TLS :21)</option>}
          <option value="sftp">SFTP (SSH :22)</option>
          {!sftpOnly && <option value="esp-https">Getty ESP HTTPS API (:443)</option>}
          {!sftpOnly && <option value="ftps-implicit">Implicit FTPS (TLS :990)</option>}
          {!sftpOnly && <option value="ftp">Plain FTP (unencrypted)</option>}
        </select>
      </label>
      <label className="svg-field">
        <span className="svg-label">{dirLabel}</span>
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
          <option value="strict">{isSftp ? "Ask to trust & pin on first connect" : "Verify CA certificate"}</option>
          <option value="pinned">{isSftp ? "Pinned SSH host key (SHA-256)" : "Pin server SHA-256 fingerprint"}</option>
          <option value="accept-self-signed">{isSftp ? "Always trust unknown SSH host key" : "Trust unknown server cert"}</option>
        </select>
      </label>
      {active.tlsPolicy === "pinned" && <PinnedShaField value={active.pinnedCertSha256} onPatch={onPatch} />}
      <BridgeUrlInput bridgeUrl={bridgeUrl} onBridgeUrl={onBridgeUrl} />
    </>
  );
}

function PinnedShaField({ value, onPatch }: { value: string; onPatch: (p: Partial<StockFtpPreset>) => void }) {
  return (
    <label className="svg-field">
      <span className="svg-label">Pinned SHA-256</span>
      <input className="svg-input" data-testid="stock-ftp-pin" value={value}
        onChange={(e) => onPatch({ pinnedCertSha256: e.target.value })} placeholder="64-hex SHA-256" />
    </label>
  );
}

function BridgeUrlInput({ bridgeUrl, onBridgeUrl }: { bridgeUrl: string; onBridgeUrl: (u: string) => void }) {
  return (
    <label className="svg-field">
      <span className="svg-label">Local FTPS/SFTP helper</span>
      <input className="svg-input" data-testid="stock-ftp-bridge-url" value={bridgeUrl}
        onChange={(e) => onBridgeUrl(e.target.value)} />
    </label>
  );
}
