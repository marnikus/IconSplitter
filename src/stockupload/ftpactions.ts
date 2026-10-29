// ftpactions.ts — Stock FTPS/SFTP/ESP preset mutations, local-only credential
// actions, Getty OAuth2 PKCE browser sign-in, and connection/staging test.

import { useMemo, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import {
  checkBridgeEspOAuthStatus, startBridgeEspOAuth, testBridgeFtps,
} from "../lib/stockupload/bridgeclient";
import type { ExtraCredentials, FtpCredentials } from "../lib/stockupload/credvault";
import {
  addCustomStockPreset, patchStockPreset, removeStockPreset,
  resetBuiltinStockPreset, toggleTargetPreset,
} from "../lib/stockupload/presets";
import type { StockFtpPreset, StockPresetState, UploadFormatKey } from "../lib/stockupload/types";
import { probeEspStageFolder } from "./espstage";
import { clearFtpCredentials, readFtpCredentials, saveFtpCredentials } from "./keystore";
import { setStockPresetState } from "./presetstore";

export interface FtpTestStatus {
  busy: boolean;
  ok: boolean | null;
  note: string;
  certSha256: string | null;
}

export interface StockFtpActions {
  selectPreset: (id: string) => void;
  addPreset: (name: string) => void;
  deletePreset: (id: string) => void;
  resetBuiltin: (id: string) => void;
  updatePreset: (id: string, patch: Partial<StockFtpPreset>) => void;
  toggleTarget: (id: string) => void;
  setFormat: (key: UploadFormatKey, enabled: boolean) => void;
  saveCreds: (presetId: string, username: string, password: string, extra?: ExtraCredentials) => Promise<boolean>;
  forgetCreds: (presetId: string) => Promise<void>;
  testConnection: (presetId: string) => Promise<void>;
  authorizeEspOAuth: (presetId: string) => Promise<void>;
  trustPinnedCert: (presetId: string, sha256: string) => void;
}

export interface FtpCtx {
  presetState: StockPresetState;
  bridgeUrl: string;
  rootRef: { current: DirHandleLike | null };
  say: (msg: string, err?: boolean) => void;
  setCredSaved: (presetId: string, saved: boolean) => void;
  setTestStatus: (s: FtpTestStatus) => void;
}

async function performSaveCreds(c: FtpCtx, presetId: string, creds: FtpCredentials): Promise<boolean> {
  const outcome = await saveFtpCredentials(presetId, creds);
  if (outcome === "empty") {
    c.say("Enter credentials (or Getty API Key) before saving — empty fields never overwrite saved credentials", true);
    return false;
  }
  c.setCredSaved(presetId, true);
  const msg = outcome === "device"
    ? "Credentials saved locally on this device only"
    : "Credentials kept in local session memory only";
  c.say(msg, outcome === "session");
  return true;
}

function protocolSuccessLabel(preset: StockFtpPreset): string {
  if (preset.protocol === "esp-https") return "Connected & authenticated via Getty ESP HTTPS (port 443)";
  if (preset.protocol === "sftp") return "Connected & authenticated via SFTP (SSH port 22)";
  return "Connected & authenticated via FTPS";
}

function protocolShortName(preset: StockFtpPreset): string {
  if (preset.protocol === "esp-https") return "Getty ESP HTTPS";
  return preset.protocol === "sftp" ? "SFTP" : "FTPS";
}

async function performTestEspStage(c: FtpCtx, preset: StockFtpPreset): Promise<void> {
  const res = await probeEspStageFolder(c.rootRef.current, preset.remoteDir);
  const note = res.ok
    ? `Getty ESP batch folder ready (${res.relBase}/) — click Upload to stage paired EPS + JPG + getty_esp_metadata.csv`
    : res.reason;
  c.setTestStatus({ busy: false, ok: res.ok, note, certSha256: null });
  c.say(note, !res.ok);
}

async function performTestWithPreset(c: FtpCtx, preset: StockFtpPreset): Promise<void> {
  if (preset.protocol === "esp-batch") {
    await performTestEspStage(c, preset);
    return;
  }
  const creds = await readFtpCredentials(preset.id);
  if (creds === null) {
    const missing = preset.protocol === "esp-https"
      ? "Save your Getty ESP API Key locally first."
      : "Save local credentials first before testing.";
    c.setTestStatus({ busy: false, ok: false, note: missing, certSha256: null });
    c.say(missing, true);
    return;
  }
  const protoLabel = protocolShortName(preset);
  c.setTestStatus({ busy: true, ok: null, note: `Connecting to ${preset.host}:${preset.port} over ${protoLabel}…`, certSha256: null });
  const res = await testBridgeFtps(c.bridgeUrl, preset, creds);
  const note = (res.ok ? protocolSuccessLabel(preset) : res.reason).trim() || "Connection failed";
  c.setTestStatus({ busy: false, ok: res.ok, note, certSha256: res.serverCertSha256 });
  c.say(note, !res.ok);
}

async function pollOAuthCompletion(c: FtpCtx, state: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    const st = await checkBridgeEspOAuthStatus(c.bridgeUrl, state);
    if (st.authorized) {
      const msg = "Getty OAuth2 authorized — click Test connection or Upload";
      c.setTestStatus({ busy: false, ok: true, note: msg, certSha256: null });
      c.say(msg, false);
      return;
    }
    if (st.error) {
      c.setTestStatus({ busy: false, ok: false, note: st.error, certSha256: null });
      c.say(st.error, true);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function performAuthorizeEspOAuth(c: FtpCtx, presetId: string): Promise<void> {
  const preset = c.presetState.presets.find((p) => p.id === presetId);
  if (!preset) return;
  const creds = await readFtpCredentials(preset.id);
  if (!creds?.apiKey) {
    const msg = "Save your Getty API Key locally first before starting OAuth2 sign-in.";
    c.setTestStatus({ busy: false, ok: false, note: msg, certSha256: null });
    c.say(msg, true);
    return;
  }
  const started = await startBridgeEspOAuth(c.bridgeUrl, preset, creds);
  if (!started.ok) {
    c.setTestStatus({ busy: false, ok: false, note: started.reason, certSha256: null });
    c.say(started.reason, true);
    return;
  }
  window.open(started.authorizeUrl, "_blank", "noopener,noreferrer");
  c.setTestStatus({ busy: true, ok: null, note: "Complete Getty / iStock sign-in in the opened browser tab…", certSha256: null });
  void pollOAuthCompletion(c, started.state);
}

function enrichGettyProtocolPatch(cur: StockFtpPreset | undefined, patch: Partial<StockFtpPreset>): Partial<StockFtpPreset> {
  if (!cur || cur.template !== "getty-images" || !patch.protocol || patch.protocol === cur.protocol) return patch;
  if (patch.protocol === "esp-https") {
    return { host: "api.gettyimages.com", port: 443, remoteDir: "/esp/submission/v1/submission_batches", ...patch };
  }
  if (patch.protocol === "esp-batch") {
    return { host: "esp.gettyimages.com", port: 443, remoteDir: "/_getty_esp_batches", ...patch };
  }
  return patch;
}

function buildPresetListCrud(ref: { current: FtpCtx }): Pick<
  StockFtpActions, "selectPreset" | "addPreset" | "deletePreset" | "resetBuiltin"
> {
  return {
    selectPreset: (id) => {
      const st = ref.current.presetState;
      if (st.presets.some((p) => p.id === id)) setStockPresetState({ ...st, activePresetId: id });
      ref.current.setTestStatus({ busy: false, ok: null, note: "", certSha256: null });
    },
    addPreset: (name) => {
      setStockPresetState(addCustomStockPreset(ref.current.presetState, name));
      ref.current.say(`Added stock FTP preset "${name.trim() || "Custom Stock"}"`);
    },
    deletePreset: (id) => {
      setStockPresetState(removeStockPreset(ref.current.presetState, id));
      void clearFtpCredentials(id);
      ref.current.setCredSaved(id, false);
    },
    resetBuiltin: (id) => {
      const next = resetBuiltinStockPreset(ref.current.presetState, id);
      setStockPresetState(next);
      const label = next.presets.find((p) => p.id === id)?.name ?? "Stock";
      ref.current.say(`${label} settings restored to defaults`);
    },
  };
}

function buildPresetFieldOps(ref: { current: FtpCtx }): Pick<
  StockFtpActions, "updatePreset" | "toggleTarget" | "setFormat" | "trustPinnedCert"
> {
  return {
    updatePreset: (id, patch) => {
      const cur = ref.current.presetState.presets.find((p) => p.id === id);
      setStockPresetState(patchStockPreset(ref.current.presetState, id, enrichGettyProtocolPatch(cur, patch)));
    },
    toggleTarget: (id) => setStockPresetState(toggleTargetPreset(ref.current.presetState, id)),
    setFormat: (key, enabled) => {
      const st = ref.current.presetState;
      setStockPresetState({ ...st, formats: { ...st.formats, [key]: enabled } });
    },
    trustPinnedCert: (id, sha256) => {
      const next = patchStockPreset(ref.current.presetState, id, { tlsPolicy: "pinned", pinnedCertSha256: sha256 });
      setStockPresetState(next);
      ref.current.say("Pinned server SHA-256 fingerprint");
      const updated = next.presets.find((p) => p.id === id);
      if (updated) void performTestWithPreset({ ...ref.current, presetState: next }, updated);
    },
  };
}

export function useStockFtpActions(ctx: FtpCtx): StockFtpActions {
  const ref = useRef(ctx);
  ref.current = ctx;
  return useMemo(() => ({
    ...buildPresetListCrud(ref),
    ...buildPresetFieldOps(ref),
    saveCreds: (presetId, username, password, extra) =>
      performSaveCreds(ref.current, presetId, { username, password, ...extra }),
    forgetCreds: async (presetId) => {
      await clearFtpCredentials(presetId);
      ref.current.setCredSaved(presetId, false);
      ref.current.say("Local credentials removed from this device");
    },
    testConnection: async (presetId) => {
      const preset = ref.current.presetState.presets.find((p) => p.id === presetId);
      if (preset) await performTestWithPreset(ref.current, preset);
    },
    authorizeEspOAuth: (presetId) => performAuthorizeEspOAuth(ref.current, presetId),
  }), []);
}
