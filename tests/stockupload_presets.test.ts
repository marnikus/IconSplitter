import { describe, expect, it } from "vitest";
import {
  ADOBE_STOCK_PRESET,
  DEFAULT_STOCK_STATE,
  SHUTTERSTOCK_PRESET,
  addCustomStockPreset,
  normalizeCertFingerprint,
  normalizeRemoteDir,
  parseStockPresetState,
  patchStockPreset,
  presetFieldsOf,
  removeStockPreset,
  resetBuiltinStockPreset,
  serializeStockPresetState,
  toggleFormatFlag,
  toggleTargetPreset,
} from "../src/lib/stockupload/presets";
import {
  STOCK_PRESETS_KEY, loadStockPresetState, resetStockPresetStore, saveStockPresetState,
} from "../src/stockupload/presetstore";

describe("stock FTP/SFTP presets — Shutterstock & Adobe Stock defaults", () => {
  it("seeds both Shutterstock Explicit FTPS (:21) and Adobe Stock SFTP (:22)", () => {
    expect(DEFAULT_STOCK_STATE.presets).toEqual([SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET]);
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
    expect(ADOBE_STOCK_PRESET).toMatchObject({
      id: "adobe-stock",
      name: "Adobe Stock",
      template: "adobe-stock",
      protocol: "sftp",
      host: "sftp.contributor.adobestock.com",
      port: 22,
      remoteDir: "/",
      tlsPolicy: "strict",
    });
    expect(DEFAULT_STOCK_STATE.activePresetId).toBe("shutterstock");
    expect(DEFAULT_STOCK_STATE.checkedTargets).toEqual(["shutterstock"]);
  });

  it("migrates older localStorage snapshots that lacked Adobe Stock by appending missing built-in presets", () => {
    const legacy = JSON.stringify({
      v: 1,
      presets: [SHUTTERSTOCK_PRESET],
      activePresetId: "shutterstock",
      checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: true, eps: true, zip: false },
    });
    const parsed = parseStockPresetState(legacy);
    expect(parsed.presets.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock"]);
  });

  it("varies protocol fields and default ports across Explicit FTPS, SFTP, Implicit FTPS, and plain FTP", () => {
    expect(presetFieldsOf("ftps-explicit")).toEqual({
      usesTls: true, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: false,
    });
    expect(presetFieldsOf("sftp")).toEqual({
      usesTls: false, usesSshHostKey: true, defaultPort: 22, unencryptedWarning: false,
    });
    expect(presetFieldsOf("ftps-implicit")).toEqual({
      usesTls: true, usesSshHostKey: false, defaultPort: 990, unencryptedWarning: false,
    });
    expect(presetFieldsOf("ftp")).toEqual({
      usesTls: false, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: true,
    });

    const toSftp = patchStockPreset(DEFAULT_STOCK_STATE, "shutterstock", { protocol: "sftp" });
    expect(toSftp.presets[0].port).toBe(22);

    const restored = resetBuiltinStockPreset(toSftp, "shutterstock");
    expect(restored.presets[0]).toEqual(SHUTTERSTOCK_PRESET);
  });

  it("adds, edits, checks/unchecks multi-site targets, toggles formats, and protects built-in presets from deletion", () => {
    const added = addCustomStockPreset(DEFAULT_STOCK_STATE, "Dreamstime");
    expect(added.presets).toHaveLength(3);
    const customId = added.presets[2].id;
    expect(added.activePresetId).toBe(customId);
    expect(added.checkedTargets).toContain(customId);

    // Built-in presets cannot be removed
    expect(removeStockPreset(added, "adobe-stock").presets).toHaveLength(3);

    const toggled = toggleTargetPreset(added, "shutterstock");
    expect(toggled.checkedTargets).toEqual([customId]);

    const fmt = toggleFormatFlag(toggled, "zip");
    expect(fmt.formats.zip).toBe(true);

    const removed = removeStockPreset(fmt, customId);
    expect(removed.presets.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock"]);
    expect(removed.activePresetId).toBe("shutterstock");
    expect(removed.checkedTargets).toEqual([]);
  });

  it("normalizes remote paths, sftp:// host prefixes, and SHA-256 fingerprints and recovers from corrupt payloads", () => {
    expect(normalizeRemoteDir("")).toBe("/");
    expect(normalizeRemoteDir("uploads/icons/")).toBe("/uploads/icons");
    expect(normalizeRemoteDir("/../../etc/passwd")).toBe("/etc/passwd");
    expect(normalizeCertFingerprint("SHA256:aa:bb:cc:11")).toBe("aabbcc11");
    expect(normalizeCertFingerprint("aa:bb:cc:11")).toBe("aabbcc11");

    const edited = patchStockPreset(DEFAULT_STOCK_STATE, "adobe-stock", {
      host: "sftp://sftp.contributor.adobestock.com/extra",
    });
    expect(edited.presets[1].host).toBe("sftp.contributor.adobestock.com");

    expect(parseStockPresetState("not json")).toEqual(DEFAULT_STOCK_STATE);
    expect(parseStockPresetState(JSON.stringify({ v: 99 }))).toEqual(DEFAULT_STOCK_STATE);
  });

  it("never persists or reads back username/password in localStorage preset JSON", () => {
    localStorage.clear();
    resetStockPresetStore();
    const tampered = JSON.stringify({
      v: 1,
      presets: [
        { ...SHUTTERSTOCK_PRESET, username: "leak@example.com", password: "secret" },
        { ...ADOBE_STOCK_PRESET, username: "210333617", password: "generated-sftp-password" },
      ],
      activePresetId: "adobe-stock",
      checkedTargets: ["shutterstock", "adobe-stock"],
      formats: { raster: true, svg: true, eps: false, zip: true },
    });
    const parsed = parseStockPresetState(tampered);
    const rawJson = JSON.stringify(parsed);
    expect(rawJson).not.toContain("leak@example.com");
    expect(rawJson).not.toContain("210333617");
    expect(rawJson).not.toContain("generated-sftp-password");

    saveStockPresetState(parsed);
    const reloaded = loadStockPresetState();
    expect(reloaded.activePresetId).toBe("adobe-stock");
    expect(serializeStockPresetState(reloaded)).not.toContain("password");
  });

  it("guarantees Adobe Stock and Shutterstock exist first even when legacy localStorage had MAX_STOCK_PRESETS items, and heals localStorage on load", () => {
    localStorage.clear();
    resetStockPresetStore();

    // 1. Legacy single-preset localStorage is healed immediately in localStorage on loadStockPresetState()
    localStorage.setItem(STOCK_PRESETS_KEY, JSON.stringify({
      v: 1,
      presets: [SHUTTERSTOCK_PRESET],
      activePresetId: "shutterstock",
      checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: false, eps: true, zip: false },
    }));
    const healed = loadStockPresetState();
    expect(healed.presets.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock"]);
    const storedAfterLoad = JSON.parse(localStorage.getItem(STOCK_PRESETS_KEY) ?? "{}") as { presets?: Array<{ id: string }> };
    expect(storedAfterLoad.presets?.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock"]);

    // 2. Even if 25 custom presets were in localStorage, built-in Shutterstock & Adobe Stock are never dropped
    const customMany = Array.from({ length: 25 }, (_, i) => ({
      ...SHUTTERSTOCK_PRESET,
      id: `custom-${i + 1}`,
      name: `Custom ${i + 1}`,
      template: "custom",
    }));
    const full = parseStockPresetState(JSON.stringify({
      v: 1,
      presets: customMany,
      activePresetId: "custom-1",
      checkedTargets: ["custom-1"],
      formats: { raster: true, svg: false, eps: true, zip: false },
    }));
    expect(full.presets.slice(0, 2).map((p) => p.id)).toEqual(["shutterstock", "adobe-stock"]);
  });

  it("auto-heals stale Adobe Stock localStorage entries that had FTPS (:21) back to SFTP (:22)", () => {
    const staleAdobe = JSON.stringify({
      v: 1,
      presets: [
        SHUTTERSTOCK_PRESET,
        {
          ...ADOBE_STOCK_PRESET,
          protocol: "ftps-explicit",
          port: 21,
          tlsPolicy: "accept-self-signed",
        },
      ],
      activePresetId: "adobe-stock",
      checkedTargets: ["adobe-stock"],
      formats: { raster: false, svg: true, eps: true, zip: false },
    });
    const healed = parseStockPresetState(staleAdobe);
    const adobe = healed.presets.find((p) => p.id === "adobe-stock")!;
    expect(adobe.protocol).toBe("sftp");
    expect(adobe.port).toBe(22);
    expect(adobe.tlsPolicy).toBe("accept-self-signed");
  });
});
