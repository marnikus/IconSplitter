// ftpactions.ts — Stock FTP/SFTP preset mutations, local-only credential actions,
// and connection test (credentials never enter React state or localStorage).

import { useMemo, useRef } from "react";
import { testBridgeFtps } from "../lib/stockupload/bridgeclient";
import {
  addCustomStockPreset, patchStockPreset, removeStockPreset,
  resetBuiltinStockPreset, toggleTargetPreset,
} from "../lib/stockupload/presets";
import type { StockFtpPreset, StockPresetState, UploadFormatKey } from "../lib/stockupload/types";
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
  saveCreds: (presetId: string, username: string, password: string) => Promise<boolean>;
  forgetCreds: (presetId: string) => Promise<void>;
  testConnection: (presetId: string) => Promise<void>;
  trustPinnedCert: (presetId: string, sha256: string) => void;
}

export interface FtpCtx {
  presetState: StockPresetState;
  bridgeUrl: string;
  say: (msg: string, err?: boolean) => void;
  setCredSaved: (presetId: string, saved: boolean) => void;
  setTestStatus: (s: FtpTestStatus) => void;
}

async function performSaveCreds(
  c: FtpCtx, presetId: string, username: string, password: string,
): Promise<boolean> {
  const outcome = await saveFtpCredentials(presetId, { username, password });
  if (outcome === "empty") {
    c.say("Enter both username and password — empty fields never overwrite saved credentials", true);
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
  return preset.protocol === "sftp"
    ? "Connected & authenticated via SFTP (SSH port 22)"
    : "Connected & authenticated via FTPS";
}

async function performTestWithPreset(c: FtpCtx, preset: StockFtpPreset): Promise<void> {
  const creds = await readFtpCredentials(preset.id);
  if (creds === null) {
    c.setTestStatus({ busy: false, ok: false, note: "Save local credentials first before testing.", certSha256: null });
    return;
  }
  const protoLabel = preset.protocol === "sftp" ? "SFTP" : "FTPS";
  c.setTestStatus({ busy: true, ok: null, note: `Connecting over ${protoLabel}…`, certSha256: null });
  const res = await testBridgeFtps(c.bridgeUrl, preset, creds);
  const note = res.ok ? protocolSuccessLabel(preset) : res.reason;
  c.setTestStatus({ busy: false, ok: res.ok, note, certSha256: res.serverCertSha256 });
}

async function performTestConnection(c: FtpCtx, presetId: string): Promise<void> {
  const preset = c.presetState.presets.find((p) => p.id === presetId);
  if (!preset) return;
  await performTestWithPreset(c, preset);
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
    updatePreset: (id, patch) => setStockPresetState(patchStockPreset(ref.current.presetState, id, patch)),
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
    saveCreds: (presetId, username, password) => performSaveCreds(ref.current, presetId, username, password),
    forgetCreds: async (presetId) => {
      await clearFtpCredentials(presetId);
      ref.current.setCredSaved(presetId, false);
      ref.current.say("Local credentials removed from this device");
    },
    testConnection: (presetId) => performTestConnection(ref.current, presetId),
  }), []);
}
