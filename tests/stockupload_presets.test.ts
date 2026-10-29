import { describe, expect, it } from "vitest";
import {
  ADOBE_STOCK_PRESET,
  DEFAULT_STOCK_STATE,
  GETTY_IMAGES_PRESET,
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

describe("stock presets — Shutterstock FTPS, Adobe Stock SFTP & Getty Images ESP", () => {
  it("seeds Shutterstock (:21), Adobe Stock (:22), and Getty Images ESP HTTPS (:443)", () => {
    expect(DEFAULT_STOCK_STATE.presets).toEqual([
      SHUTTERSTOCK_PRESET,
      ADOBE_STOCK_PRESET,
      GETTY_IMAGES_PRESET,
    ]);
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
    expect(GETTY_IMAGES_PRESET).toMatchObject({
      id: "getty-images",
      name: "Getty Images",
      template: "getty-images",
      protocol: "esp-https",
      host: "api.gettyimages.com",
      port: 443,
      remoteDir: "/esp/submission/v1/submission_batches",
      tlsPolicy: "strict",
    });
    expect(DEFAULT_STOCK_STATE.activePresetId).toBe("shutterstock");
    expect(DEFAULT_STOCK_STATE.checkedTargets).toEqual(["shutterstock"]);
  });

  it("migrates older localStorage snapshots that lacked Adobe Stock or Getty Images by appending missing built-in presets", () => {
    const legacy = JSON.stringify({
      v: 1,
      presets: [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET],
      activePresetId: "shutterstock",
      checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: true, eps: true, zip: false },
    });
    const parsed = parseStockPresetState(legacy);
    expect(parsed.presets.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock", "getty-images"]);
  });

  it("varies protocol fields and default ports across Explicit FTPS, SFTP, Getty ESP HTTPS, Implicit FTPS, and plain FTP", () => {
    expect(presetFieldsOf("ftps-explicit")).toEqual({
      usesTls: true, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: false,
    });
    expect(presetFieldsOf("sftp")).toEqual({
      usesTls: false, usesSshHostKey: true, defaultPort: 22, unencryptedWarning: false,
    });
    expect(presetFieldsOf("esp-https")).toEqual({
      usesTls: true, usesSshHostKey: false, defaultPort: 443, unencryptedWarning: false,
    });
    expect(presetFieldsOf("ftps-implicit")).toEqual({
      usesTls: true, usesSshHostKey: false, defaultPort: 990, unencryptedWarning: false,
    });
    expect(presetFieldsOf("ftp")).toEqual({
      usesTls: false, usesSshHostKey: false, defaultPort: 21, unencryptedWarning: true,
    });

    const gettySftp = patchStockPreset(DEFAULT_STOCK_STATE, "getty-images", {
      protocol: "sftp",
      host: "sftp://files.transfer.brandfolder.com/",
      remoteDir: "/",
    });
    const gettyEdited = gettySftp.presets.find((p) => p.id === "getty-images")!;
    expect(gettyEdited.protocol).toBe("sftp");
    expect(gettyEdited.port).toBe(22);
    expect(gettyEdited.host).toBe("files.transfer.brandfolder.com");

    const restored = resetBuiltinStockPreset(gettySftp, "getty-images");
    expect(restored.presets.find((p) => p.id === "getty-images")).toEqual(GETTY_IMAGES_PRESET);
  });

  it("adds, edits, checks/unchecks multi-site targets, toggles formats, and protects built-in presets from deletion", () => {
    const added = addCustomStockPreset(DEFAULT_STOCK_STATE, "Dreamstime");
    expect(added.presets).toHaveLength(4);
    const customId = added.presets[3].id;
    expect(added.activePresetId).toBe(customId);
    expect(added.checkedTargets).toContain(customId);

    // Built-in presets cannot be removed
    expect(removeStockPreset(added, "adobe-stock").presets).toHaveLength(4);
    expect(removeStockPreset(added, "getty-images").presets).toHaveLength(4);

    const toggled = toggleTargetPreset(added, "shutterstock");
    expect(toggled.checkedTargets).toEqual([customId]);

    const fmt = toggleFormatFlag(toggled, "zip");
    expect(fmt.formats.zip).toBe(true);

    const removed = removeStockPreset(fmt, customId);
    expect(removed.presets.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock", "getty-images"]);
    expect(removed.activePresetId).toBe("shutterstock");
    expect(removed.checkedTargets).toEqual([]);
  });

  it("normalizes remote paths, https:// or sftp:// host prefixes, and SHA-256 fingerprints and recovers from corrupt payloads", () => {
    expect(normalizeRemoteDir("")).toBe("/");
    expect(normalizeRemoteDir("uploads/icons/")).toBe("/uploads/icons");
    expect(normalizeRemoteDir("/../../etc/passwd")).toBe("/etc/passwd");
    expect(normalizeCertFingerprint("SHA256:aa:bb:cc:11")).toBe("aabbcc11");
    expect(normalizeCertFingerprint("aa:bb:cc:11")).toBe("aabbcc11");

    const edited = patchStockPreset(DEFAULT_STOCK_STATE, "getty-images", {
      host: "https://api.gettyimages.com/esp",
    });
    expect(edited.presets[2].host).toBe("api.gettyimages.com");

    expect(parseStockPresetState("not json")).toEqual(DEFAULT_STOCK_STATE);
    expect(parseStockPresetState(JSON.stringify({ v: 99 }))).toEqual(DEFAULT_STOCK_STATE);
  });

  it("never persists or reads back username/password/apiKey/apiSecret in localStorage preset JSON", () => {
    localStorage.clear();
    resetStockPresetStore();
    const tampered = JSON.stringify({
      v: 1,
      presets: [
        { ...SHUTTERSTOCK_PRESET, username: "leak@example.com", password: "secret" },
        { ...ADOBE_STOCK_PRESET, username: "210333617", password: "generated-sftp-password" },
        { ...GETTY_IMAGES_PRESET, username: "esp@example.com", password: "esp-password", apiKey: "getty-key-123", apiSecret: "getty-secret-456" },
      ],
      activePresetId: "getty-images",
      checkedTargets: ["shutterstock", "adobe-stock", "getty-images"],
      formats: { raster: true, svg: false, eps: true, zip: false },
    });
    const parsed = parseStockPresetState(tampered);
    const rawJson = JSON.stringify(parsed);
    for (const secret of ["leak@example.com", "210333617", "generated-sftp-password", "esp@example.com", "esp-password", "getty-key-123", "getty-secret-456"]) {
      expect(rawJson).not.toContain(secret);
    }

    saveStockPresetState(parsed);
    const reloaded = loadStockPresetState();
    expect(reloaded.activePresetId).toBe("getty-images");
    expect(serializeStockPresetState(reloaded)).not.toContain("apiSecret");
  });

  it("guarantees all three built-in presets exist first even when legacy localStorage had MAX_STOCK_PRESETS items, and heals localStorage on load", () => {
    localStorage.clear();
    resetStockPresetStore();

    localStorage.setItem(STOCK_PRESETS_KEY, JSON.stringify({
      v: 1,
      presets: [SHUTTERSTOCK_PRESET],
      activePresetId: "shutterstock",
      checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: false, eps: true, zip: false },
    }));
    const healed = loadStockPresetState();
    expect(healed.presets.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock", "getty-images"]);
    const storedAfterLoad = JSON.parse(localStorage.getItem(STOCK_PRESETS_KEY) ?? "{}") as { presets?: Array<{ id: string }> };
    expect(storedAfterLoad.presets?.map((p) => p.id)).toEqual(["shutterstock", "adobe-stock", "getty-images"]);

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
    expect(full.presets.slice(0, 3).map((p) => p.id)).toEqual(["shutterstock", "adobe-stock", "getty-images"]);
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
