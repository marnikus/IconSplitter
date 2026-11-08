// StockFtpPanel.tsx — stock FTPS/SFTP/ESP presets dropdown, per-stock varying
// fields, Getty ESP CSV & portal launchers, and local-only credentials card.

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
  if (protocol === "getty-web") return "Getty web";
  if (protocol === "esp-batch") return "Getty ESP staging";
  if (protocol === "esp-https") return "Getty ESP API";
  if (protocol === "sftp") return "SFTP";
  return protocol === "ftp" ? "FTP · unencrypted" : "FTPS";
}

function endpointSummary(active: StockFtpPreset): string {
  if (active.protocol === "esp-batch") return `${active.remoteDir} → esp.gettyimages.com`;
  if (active.protocol === "getty-web") return `https://${active.host || "esp.gettyimages.com"}${active.remoteDir}`;
  return `${active.host || "no host"}:${active.port} · ${active.protocol}`;
}

export default function StockFtpPanel(p: StockFtpPanelProps) {
  const active = p.presetState.presets.find((s) => s.id === p.presetState.activePresetId) ?? p.presetState.presets[0];
  const saved = Boolean(p.credSaved[active.id]);
  return (
    <div className={`svg-provider stock-ftp-provider${p.ftpOpen ? "" : " closed"}`} data-testid="stock-ftp-panel">
      <div className="svg-provider-top stock-ftp-provider-top">
        <span className="stock-provider-summary" title={endpointSummary(active)}>
          <strong data-testid="stock-ftp-active-name">{active.name}</strong>
          <span>{protocolBadgeCopy(active.protocol)} · {endpointSummary(active)}</span>
        </span>
        <QuickPresetSwitch presets={p.presetState.presets} activeId={active.id} ftpOpen={p.ftpOpen}
          actions={p.actions} onToggleOpen={p.onToggleOpen} />
        <button type="button" className="svg-link stock-ftp-toggle" data-testid="stock-ftp-toggle" aria-expanded={p.ftpOpen}
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
        <button key={pr.id} type="button" data-testid={`stock-ftp-quick-${pr.id}`} title={pr.name}
          aria-label={`Select ${pr.name}`}
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
    <fieldset className="stock-ftp-section stock-preset-section" data-testid="stock-ftp-preset-group">
      <legend>Stock preset</legend>
      <div className="stock-preset-row">
        <label className="svg-field stock-preset-select">
          <span className="svg-label">Preset</span>
          <select className="svg-input" data-testid="stock-ftp-preset-select" aria-label="Stock website preset"
            value={active.id} onChange={(e) => actions.selectPreset(e.target.value)}>
            {presetState.presets.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
          </select>
        </label>
        <div className="stock-preset-actions">
          <PresetActionButtons active={active} actions={actions} onDownloadGettyCsv={onDownloadGettyCsv} />
        </div>
        <NewPresetField onAdd={actions.addPreset} />
      </div>
    </fieldset>
  );
}

function PresetActionButtons({ active, actions, onDownloadGettyCsv }: {
  active: StockFtpPreset; actions: StockFtpActions; onDownloadGettyCsv?: () => void;
}) {
  return (
    <>
      {active.template !== "custom" ? (
        <button type="button" className="svg-btn tiny" data-testid="stock-ftp-reset-builtin"
          title={`Restore ${active.name} connection defaults`}
          onClick={() => actions.resetBuiltin(active.id)}>↺ Reset defaults</button>
      ) : (
        <button type="button" className="svg-btn tiny danger" data-testid="stock-ftp-delete"
          onClick={() => actions.deletePreset(active.id)}>Remove preset</button>
      )}
      {(active.template === "getty-images" || active.template === "getty-web") && (
        <GettyPortalButtons onDownloadGettyCsv={active.template === "getty-images" ? onDownloadGettyCsv : undefined} />
      )}
    </>
  );
}

function GettyPortalButtons({ onDownloadGettyCsv }: { onDownloadGettyCsv?: () => void }) {
  return (
    <>
      {onDownloadGettyCsv && (
        <button type="button" className="svg-btn tiny" data-testid="stock-getty-csv" onClick={onDownloadGettyCsv}>
          ⇩ ESP CSV
        </button>
      )}
      <a className="svg-btn tiny" data-testid="stock-open-esp" href="https://esp.gettyimages.com"
        target="_blank" rel="noopener noreferrer" title="Open Getty ESP">↗ ESP</a>
      <a className="svg-btn tiny" data-testid="stock-open-deepmeta" href="https://deepmeta.creativ.zone"
        target="_blank" rel="noopener noreferrer" title="Open DeepMeta 4">↗ DeepMeta</a>
    </>
  );
}

function NewPresetField({ onAdd }: { onAdd: (name: string) => void }) {
  const [newName, setNewName] = useState("");
  const create = () => { onAdd(newName || "Custom Stock"); setNewName(""); };
  return (
    <div className="stock-new-preset">
      <label className="svg-field">
        <span className="svg-label">Add preset</span>
        <input className="svg-input" type="text" placeholder="New stock name…" aria-label="New stock name"
          data-testid="stock-ftp-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
      </label>
      <button type="button" className="svg-btn tiny" data-testid="stock-ftp-add" onClick={create}>+ Add stock</button>
    </div>
  );
}

function ConnectionFields({ active, bridgeUrl, onBridgeUrl, actions }: {
  active: StockFtpPreset; bridgeUrl: string; onBridgeUrl: (u: string) => void; actions: StockFtpActions;
}) {
  const patch = (next: Partial<StockFtpPreset>) => actions.updatePreset(active.id, next);
  return (
    <fieldset className="stock-ftp-section stock-connection-section" data-testid="stock-ftp-connection-group">
      <legend>Connection settings</legend>
      <div className="stock-connection-grid">
        {active.protocol !== "esp-batch" && <HostPortFields active={active} onPatch={patch} />}
        <ProtocolAndFolderFields active={active} onPatch={patch} />
        {active.protocol !== "esp-batch" && (
          <SecurityFields active={active} bridgeUrl={bridgeUrl} onBridgeUrl={onBridgeUrl} onPatch={patch} />
        )}
      </div>
    </fieldset>
  );
}

function defaultHostHint(active: StockFtpPreset): string {
  if (active.template === "adobe-stock") return "sftp.contributor.adobestock.com";
  if (active.template === "getty-web") return "esp.gettyimages.com";
  return active.template === "getty-images" ? "api.gettyimages.com" : "ftps.shutterstock.com";
}

function HostPortFields({ active, onPatch }: {
  active: StockFtpPreset; onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Host</span>
        <input className="svg-input" data-testid="stock-ftp-host" value={active.host}
          onChange={(e) => onPatch({ host: e.target.value })} placeholder={defaultHostHint(active)} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Port</span>
        <input className="svg-input" type="number" min={1} max={65535} data-testid="stock-ftp-port"
          value={active.port} onChange={(e) => onPatch({ port: Number(e.target.value) })} />
      </label>
    </>
  );
}

function folderLabelOf(protocol: FtpProtocol): string {
  if (protocol === "esp-batch") return "Workspace folder";
  if (protocol === "getty-web") return "Contributor path";
  if (protocol === "esp-https") return "ESP endpoint";
  return "Remote folder";
}

function ProtocolAndFolderFields({ active, onPatch }: {
  active: StockFtpPreset; onPatch: (p: Partial<StockFtpPreset>) => void;
}) {
  const sftpOnly = active.template === "adobe-stock";
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Protocol</span>
        <select className="svg-input" data-testid="stock-ftp-protocol" value={active.protocol}
          disabled={sftpOnly} onChange={(e) => onPatch({ protocol: e.target.value as FtpProtocol })}>
          {!sftpOnly && <option value="getty-web">Getty web · browser</option>}
          {!sftpOnly && <option value="esp-https">Getty ESP API · OAuth2</option>}
          {!sftpOnly && <option value="ftps-explicit">Explicit FTPS · 21</option>}
          <option value="sftp">SFTP · 22</option>
          {!sftpOnly && <option value="ftps-implicit">Implicit FTPS · 990</option>}
          {!sftpOnly && <option value="ftp">FTP · unencrypted</option>}
        </select>
      </label>
      <label className="svg-field">
        <span className="svg-label">{folderLabelOf(active.protocol)}</span>
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
      <span className="svg-label" title="Local FTPS/SFTP helper URL">Helper URL</span>
      <input className="svg-input" data-testid="stock-ftp-bridge-url" value={bridgeUrl}
        onChange={(e) => onBridgeUrl(e.target.value)} />
    </label>
  );
}
