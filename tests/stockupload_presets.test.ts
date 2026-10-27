import { describe, expect, it } from "vitest";
import {
  DEFAULT_STOCK_STATE,
  SHUTTERSTOCK_PRESET,
  addCustomStockPreset,
  normalizeCertFingerprint,
  normalizeRemoteDir,
  parseStockPresetState,
  patchStockPreset,
  presetFieldsOf,
  removeStockPreset,
  serializeStockPresetState,
  toggleFormatFlag,
  toggleTargetPreset,
} from "../src/lib/stockupload/presets";
import { loadStockPresetState, resetStockPresetStore, saveStockPresetState } from "../src/stockupload/presetstore";

describe("stock FTP presets and Shutterstock default", () => {
  it("seeds Shutterstock Explicit FTPS (ftps.shutterstock.com:21, /) as the sole initial connection", () => {
    expect(DEFAULT_STOCK_STATE.presets).toHaveLength(1);
    expect(DEFAULT_STOCK_STATE.presets[0]).toEqual(SHUTTERSTOCK_PRESET);
    expect(SHUTTERSTOCK_PRESET).toMatchObject({
      id: "shutterstock",
      name: "Shutterstock",
      template: "shutterstock",
      protocol: "ftps-explicit",
      host: "ftps.shutterstock.com",
      port: 21,
      remoteDir: "/",
      passive: true,
      tlsPolicy: "strict",
    });
    expect(DEFAULT_STOCK_STATE.activePresetId).toBe("shutterstock");
    expect(DEFAULT_STOCK_STATE.checkedTargets).toEqual(["shutterstock"]);
  });

  it("varies visible protocol fields and default ports across Explicit FTPS, Implicit FTPS, and plain FTP", () => {
    expect(presetFieldsOf("ftps-explicit")).toEqual({ usesTls: true, defaultPort: 21, unencryptedWarning: false });
    expect(presetFieldsOf("ftps-implicit")).toEqual({ usesTls: true, defaultPort: 990, unencryptedWarning: false });
    expect(presetFieldsOf("ftp")).toEqual({ usesTls: false, defaultPort: 21, unencryptedWarning: true });

    const switched = patchStockPreset(DEFAULT_STOCK_STATE, "shutterstock", { protocol: "ftps-implicit" });
    expect(switched.presets[0].port).toBe(990);
  });

  it("adds, edits, checks/unchecks multi-FTP targets, toggles format checkboxes, and removes custom presets", () => {
    const added = addCustomStockPreset(DEFAULT_STOCK_STATE, "Dreamstime");
    expect(added.presets).toHaveLength(2);
    const secondId = added.presets[1].id;
    expect(added.activePresetId).toBe(secondId);
    expect(added.checkedTargets).toContain(secondId);

    const toggled = toggleTargetPreset(added, "shutterstock");
    expect(toggled.checkedTargets).toEqual([secondId]);

    const fmt = toggleFormatFlag(toggled, "zip");
    expect(fmt.formats.zip).toBe(true);

    const removed = removeStockPreset(fmt, secondId);
    expect(removed.presets).toHaveLength(1);
    expect(removed.activePresetId).toBe("shutterstock");
    expect(removed.checkedTargets).toEqual([]);
  });

  it("normalizes remote paths and certificate SHA-256 fingerprints and recovers from corrupt payloads", () => {
    expect(normalizeRemoteDir("")).toBe("/");
    expect(normalizeRemoteDir("uploads/icons/")).toBe("/uploads/icons");
    expect(normalizeRemoteDir("/../../etc/passwd")).toBe("/etc/passwd");
    expect(normalizeCertFingerprint("aa:bb:cc:11")).toBe("aabbcc11");

    expect(parseStockPresetState("not json")).toEqual(DEFAULT_STOCK_STATE);
    expect(parseStockPresetState(JSON.stringify({ v: 99 }))).toEqual(DEFAULT_STOCK_STATE);
  });

  it("never persists or reads back username/password in localStorage preset JSON", () => {
    localStorage.clear();
    resetStockPresetStore();
    const tampered = JSON.stringify({
      v: 1,
      presets: [{ ...SHUTTERSTOCK_PRESET, username: "leak@example.com", password: "secret" }],
      activePresetId: "shutterstock",
      checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: true, eps: false, zip: true },
    });
    const parsed = parseStockPresetState(tampered);
    expect(JSON.stringify(parsed)).not.toContain("leak@example.com");
    expect(JSON.stringify(parsed)).not.toContain("secret");

    saveStockPresetState(parsed);
    const reloaded = loadStockPresetState();
    expect(reloaded.formats).toEqual({ raster: true, svg: true, eps: false, zip: true });
    expect(serializeStockPresetState(reloaded)).not.toContain("password");
  });
});
