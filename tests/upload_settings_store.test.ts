// upload_settings_store.test.ts — the upload tab's local stores (RULE 13):
// settings (defaults + overrides), the Gemini provider config and the view
// prefs all round-trip, and a corrupt or hand-edited payload costs one ignored
// load and the documented defaults — never a broken tab.
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/upload/gemini";
import {
  DEFAULT_UPLOAD_SETTINGS, type UploadSettings,
} from "../src/lib/upload/settings";
import { DEFAULT_PREVIEW_BACKGROUND } from "../src/lib/svgbackground";
import { ZOOM_DEFAULT } from "../src/lib/zoom";
import { loadGeminiConfig, saveGeminiConfig } from "../src/upload/configstore";
import { DEFAULT_UPLOAD_PREFS, loadUploadPrefs, saveUploadPrefs } from "../src/upload/prefsstore";
import {
  loadOverrides, loadUploadSettings, parseUploadSettingsState, saveOverrides, saveUploadSettings,
} from "../src/upload/settingsstore";

beforeEach(() => localStorage.clear());

const CUSTOM: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 20, background: "#101010", strokePx: 2.2, jpegMegapixels: 12, jpegQuality: 0.8, optimizeSvg: false, includeEps: true };

describe("settingsstore — defaults + overrides", () => {
  it("round-trips the defaults and the overrides map", () => {
    saveUploadSettings({ defaults: CUSTOM, overrides: { pair_a: { paddingPct: 30 }, pair_b: { includeEps: true } } });
    const loaded = loadUploadSettings();
    expect(loaded.defaults).toEqual(CUSTOM);
    expect(loaded.overrides).toEqual({ pair_a: { paddingPct: 30 }, pair_b: { includeEps: true } });
  });

  it("round-trips the applied decoration values beside the overrides", () => {
    const applied = { pair_a: { shadowEnabled: true, shadowGapPct: 12 }, pair_b: { badgeEnabled: true, badgeWidthPct: 40 } };
    saveUploadSettings({ defaults: DEFAULT_UPLOAD_SETTINGS, overrides: { pair_a: { paddingPct: 30 } }, applied });
    const loaded = loadUploadSettings();
    expect(loaded.overrides).toEqual({ pair_a: { paddingPct: 30 } });
    expect(loaded.applied).toEqual(applied);
    // the undo path writes only the overrides and keeps the stored decorations
    saveOverrides({ pair_a: { paddingPct: 22 } });
    expect(loadUploadSettings().applied).toEqual(applied);
    expect(loadUploadSettings().overrides).toEqual({ pair_a: { paddingPct: 22 } });
  });

  it("drops junk decoration fields and a missing map instead of trusting them", () => {
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({
      v: 1, defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {},
      applied: { pair_a: { badgeEnabled: "yes", shadowEnabled: true, logo: true }, pair_b: {}, "": { badgeEnabled: true } },
    }));
    expect(loadUploadSettings().applied).toEqual({ pair_a: { shadowEnabled: true } }); // junk keys dropped
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({ v: 1, defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {} }));
    expect(loadUploadSettings().applied).toEqual({}); // an older payload reads as "nothing applied"
  });

  it("defaults when nothing was saved", () => {
    expect(loadUploadSettings()).toEqual({ defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, applied: {} });
  });

  it("rejects a corrupt payload and a wrong version instead of throwing", () => {
    localStorage.setItem("iconSplitter.upload.settings.v1", "{oops");
    expect(loadUploadSettings().defaults).toEqual(DEFAULT_UPLOAD_SETTINGS);
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({ v: 99, defaults: CUSTOM, overrides: {} }));
    expect(loadUploadSettings().defaults).toEqual(DEFAULT_UPLOAD_SETTINGS);
  });

  it("clamps the stored defaults field by field", () => {
    const parsed = parseUploadSettingsState({ v: 1, defaults: { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 999, strokePx: -4, background: "red", optimizeSvg: "yes" } });
    expect(parsed.defaults.paddingPct).toBe(50);
    expect(parsed.defaults.strokePx).toBe(0);
    expect(parsed.defaults.background).toBe("transparent"); // junk → the documented default (2026-10-08)
    expect(parsed.defaults.optimizeSvg).toBe(true);
  });

  it("keeps Shadow opt-in per icon: persisted defaults never decorate, the applied map does", () => {
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({
      v: 1, defaults: { ...DEFAULT_UPLOAD_SETTINGS, shadowEnabled: true, shadowWidthPct: 115 },
      overrides: { selected: { shadowEnabled: true }, other: { shadowEnabled: false } },
    }));
    const loaded = loadUploadSettings();
    // the persisted default flag is ignored; the numbers survive for the opt-in to use
    expect(loaded.defaults).toMatchObject({ shadowEnabled: false, shadowWidthPct: 115 });
    // an earlier payload's decoration fields move into `applied` on read, not into the overrides
    expect(loaded.overrides).toEqual({});
    expect(loaded.applied).toEqual({ selected: { shadowEnabled: true }, other: { shadowEnabled: false } });
  });

  it("keeps the corner badge opt-in per icon while preserving numeric global defaults", () => {
    localStorage.setItem("iconSplitter.upload.settings.v1", JSON.stringify({
      v: 1, defaults: { ...DEFAULT_UPLOAD_SETTINGS, badgeEnabled: true, badgeCorner: "top-left",
        badgeWidthPct: 65, badgeOffsetXPct: 8, badgeOffsetYPct: 11 },
      overrides: { selected: { badgeEnabled: true, badgeCorner: "bottom-left", badgeOffsetXPct: 12 },
        other: { badgeEnabled: "yes", badgeCorner: "center" } },
    }));
    const loaded = loadUploadSettings();
    expect(loaded.defaults).toMatchObject({ badgeEnabled: false, badgeCorner: "top-left",
      badgeWidthPct: 65, badgeOffsetXPct: 8, badgeOffsetYPct: 11 });
    // badge fields read back as applied decorations; the unticked `other` row keeps nothing
    expect(loaded.overrides).toEqual({});
    expect(loaded.applied).toEqual({ selected: { badgeEnabled: true, badgeCorner: "bottom-left", badgeOffsetXPct: 12 } });
  });

  it("drops invalid override fields and empty overrides on read", () => {
    const parsed = parseUploadSettingsState({
      v: 1, defaults: DEFAULT_UPLOAD_SETTINGS,
      overrides: { pair_a: { paddingPct: 999, background: "nope" }, pair_b: {}, pair_c: "junk" },
    });
    expect(parsed.overrides).toEqual({ pair_a: { paddingPct: 50 } });
  });

  it("writes the overrides map alone for the undo path's persist-only branch", () => {
    saveUploadSettings({ defaults: DEFAULT_UPLOAD_SETTINGS, overrides: { pair_a: { strokePx: 3 } } });
    saveOverrides({ pair_b: { jpegQuality: 0.7 } });
    expect(loadOverrides()).toEqual({ pair_b: { jpegQuality: 0.7 } });
    expect(loadUploadSettings().defaults).toEqual(DEFAULT_UPLOAD_SETTINGS); // untouched
  });
});

describe("configstore — the Gemini provider config", () => {
  it("round-trips a custom config", () => {
    const custom = { ...DEFAULT_GEMINI_CONFIG, model: "gemini-3.1-flash", timeoutMs: 30_000, retries: 0, concurrency: 2, baseUrl: "https://example.test/v1beta" };
    saveGeminiConfig(custom);
    expect(loadGeminiConfig()).toEqual(custom);
  });

  it("defaults on a corrupt payload and clamps out-of-range numbers", () => {
    localStorage.setItem("iconSplitter.upload.gemini.v1", "[1,2]");
    expect(loadGeminiConfig()).toEqual(DEFAULT_GEMINI_CONFIG);
    saveGeminiConfig({ ...DEFAULT_GEMINI_CONFIG, timeoutMs: 1, retries: 99, concurrency: 0, baseUrl: "ftp://nope" });
    const loaded = loadGeminiConfig();
    expect(loaded.timeoutMs).toBe(5_000);
    expect(loaded.retries).toBe(5);
    expect(loaded.concurrency).toBe(1);
    expect(loaded.baseUrl).toBe(DEFAULT_GEMINI_CONFIG.baseUrl);
  });
});

describe("prefsstore — the view prefs", () => {
  it("round-trips the zoom, the card state and the preview background", () => {
    saveUploadPrefs({ thumbHeight: 200, providerOpen: false, previewBg: { preset: "black", custom: "#123456" } });
    expect(loadUploadPrefs()).toEqual({ thumbHeight: 200, providerOpen: false, previewBg: { preset: "black", custom: "#123456" } });
  });

  it("defaults on a corrupt payload and clamps the zoom into the shared range", () => {
    localStorage.setItem("iconSplitter.upload.prefs.v1", "null");
    expect(loadUploadPrefs()).toEqual(DEFAULT_UPLOAD_PREFS);
    saveUploadPrefs({ thumbHeight: 99999, providerOpen: true, previewBg: DEFAULT_PREVIEW_BACKGROUND });
    expect(loadUploadPrefs().thumbHeight).toBe(800);
    expect(loadUploadPrefs().thumbHeight).not.toBe(ZOOM_DEFAULT); // a real write, not the default
  });
});
