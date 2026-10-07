// svgup_settings.test.ts — the settings rules of the SVG-to-upload tab
// (design §4 C4/C5, §5). What the request demands, case by case: global defaults
// with per-icon overrides whose inherited/overridden state is visible, a reset
// per icon, a bulk apply that is ONE undoable action, range validation that
// clamps instead of throwing, and the EFFECTIVE settings of an icon persisted so
// a restart exports the same numbers. Zoom is deliberately absent: it is display
// only and lives in the zoom prefs, never here.
import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_UPLOAD, LIMITS, applyBulk, effectiveSettings, inheritedFields,
  parseUploadSettings, resetOverride, setOverride, settingsLineOf, type UploadSettings,
} from "../src/lib/svgupload/settings";
import { loadUploadSettings, saveUploadSettings, UPLOAD_SETTINGS_KEY } from "../src/svgupload/settingsstore";

const JD = "@microsoft/fluentui-system-icons/svg/jd"; // any key the app owns

describe("defaults — the numbers the pipeline starts from", () => {
  it("targets the requested 15.1 MP and inherits the preview background rule", () => {
    expect(DEFAULT_UPLOAD.jpeg.targetMp).toBe(15.1);
    expect(DEFAULT_UPLOAD.jpeg.quality).toBe(0.9);
    expect(DEFAULT_UPLOAD.optimizeSvg).toBe(true);   // SWGO/SVGO on by default
    expect(DEFAULT_UPLOAD.includeEps).toBe(false);   // EPS optional
    expect(DEFAULT_UPLOAD.background.preset).toBe("white");
    expect(DEFAULT_UPLOAD.padding.unit).toBe("%");   // padding never a mystery px
    expect(DEFAULT_UPLOAD.stroke.unit).toBe("pt");
  });

  it("keeps a stroke disabled by default so the artwork is never rewritten unasked", () => {
    expect(DEFAULT_UPLOAD.stroke.enabled).toBe(false);
  });
});

describe("effectiveSettings — inherited vs overridden, visibly", () => {
  const settings: UploadSettings = {
    defaults: DEFAULT_UPLOAD,
    overrides: { [JD]: { outputScale: 2, jpeg: { targetMp: 4, quality: 0.8, profile: "sRGB-implied" } } },
  };

  it("returns the default for every field nobody overrode, marked inherited", () => {
    const eff = effectiveSettings(settings, "@microsoft/fluentui-system-icons/svg/other");
    expect(eff.values).toEqual(DEFAULT_UPLOAD);
    expect(eff.inherited).toContain("padding");
    expect(eff.origin.padding).toBe("default");
  });

  it("returns the override for the icon that has one, field by field", () => {
    const eff = effectiveSettings(settings, JD);
    expect(eff.values.outputScale).toBe(2);
    expect(eff.values.jpeg.targetMp).toBe(4);
    expect(eff.values.padding).toEqual(DEFAULT_UPLOAD.padding); // untouched fields stay the default
    expect(eff.origin.outputScale).toBe("override");
    expect(eff.origin.padding).toBe("default");
    expect(eff.inherited).not.toContain("outputScale");
    expect(eff.inherited).toContain("padding");
  });

  it("names the fields that are inherited, for the row chip", () => {
    expect(inheritedFields(settings, JD)).toEqual(expect.arrayContaining(["padding", "background", "stroke"]));
  });
});

describe("applyBulk — one action, one undo entry", () => {
  it("writes the same patch to every selected icon and hands back ONE record", () => {
    const before: UploadSettings = { defaults: DEFAULT_UPLOAD, overrides: {} };
    const { next, undo } = applyBulk(before, ["a", "b"], { outputScale: 3 });
    expect(next.overrides.a.outputScale).toBe(3);
    expect(next.overrides.b.outputScale).toBe(3);
    expect(undo).toHaveLength(1);                 // one undoable step, not two
    expect(undo[0].ids).toEqual(["a", "b"]);
    expect(undo[0].before).toEqual(before);       // restores exactly what was there
    expect(undo[0].after).toEqual(next);
  });

  it("undoing brings back the previous settings byte for byte", () => {
    const before: UploadSettings = { defaults: DEFAULT_UPLOAD, overrides: { a: { outputScale: 2 } } };
    const { next, undo } = applyBulk(before, ["a", "b"], { outputScale: 5 });
    expect(undo[0].before).toEqual(before);
    expect(next.overrides.a.outputScale).toBe(5);
  });

  it("does nothing at all for an empty selection", () => {
    const before: UploadSettings = { defaults: DEFAULT_UPLOAD, overrides: {} };
    const { next, undo } = applyBulk(before, [], { outputScale: 3 });
    expect(next).toEqual(before);
    expect(undo).toEqual([]);
  });
});

describe("per-icon override and reset", () => {
  it("setOverride touches one field of one icon only", () => {
    const s = setOverride({ defaults: DEFAULT_UPLOAD, overrides: {} }, JD, { outputScale: 4 });
    expect(s.overrides[JD].outputScale).toBe(4);
    expect(s.defaults).toEqual(DEFAULT_UPLOAD);
  });

  it("reset drops the whole override so the icon is inherited again", () => {
    const s = setOverride({ defaults: DEFAULT_UPLOAD, overrides: {} }, JD, { outputScale: 4 });
    const cleared = resetOverride(s, JD);
    expect(cleared.overrides[JD]).toBeUndefined();
    expect(effectiveSettings(cleared, JD).values).toEqual(DEFAULT_UPLOAD);
  });
});

describe("range validation — clamp, never throw", () => {
  it("clamps every field into its documented range", () => {
    const parsed = parseUploadSettings({
      defaults: {
        outputScale: 99, padding: { value: -3, unit: "pt" },
        stroke: { value: 900, unit: "pt", enabled: true },
        jpeg: { targetMp: 0.1, quality: 5 },
      },
    });
    const { outputScale } = parsed.defaults;
    expect(outputScale).toBe(LIMITS.scaleMax);
    expect(parsed.defaults.padding.value).toBe(0);
    expect(parsed.defaults.stroke.value).toBe(LIMITS.strokeMax);
    expect(parsed.defaults.jpeg.targetMp).toBe(LIMITS.targetMpMin);
    expect(parsed.defaults.jpeg.quality).toBe(LIMITS.qualityMax);
  });

  it("accepts the documented example — a 2.2 pt stroke", () => {
    const parsed = parseUploadSettings({
      defaults: { stroke: { value: 2.2, unit: "pt", enabled: true } },
    });
    expect(parsed.defaults.stroke).toEqual({ value: 2.2, unit: "pt", enabled: true });
  });

  it("refuses junk by falling back to the default, never by throwing", () => {
    for (const junk of [null, 42, "settings", { defaults: "nope" }, { defaults: { padding: { value: "x", unit: "em" } } }]) {
      const parsed = parseUploadSettings(junk);
      expect(parsed.defaults.jpeg.targetMp).toBe(15.1);
      expect(parsed.overrides).toEqual({});
    }
  });

  it("keeps only the override fields it can validate", () => {
    const parsed = parseUploadSettings({ defaults: {}, overrides: { a: { outputScale: 2, nonsense: 1 } } });
    expect(parsed.overrides.a.outputScale).toBe(2);
    expect((parsed.overrides.a as Record<string, unknown>).nonsense).toBeUndefined();
    expect(parsed.overrides.a.jpeg).toBeUndefined(); // absent, not a half-filled copy
  });

  it("drops an override entry that ends up empty", () => {
    const parsed = parseUploadSettings({ defaults: {}, overrides: { a: { nonsense: 1 } } });
    expect(parsed.overrides.a).toBeUndefined();
  });
});

describe("persistence — the effective settings survive a restart", () => {
  beforeEach(() => localStorage.clear());

  it("saves and loads the exact settings, overrides included", () => {
    const s = setOverride({ defaults: DEFAULT_UPLOAD, overrides: {} }, JD, { outputScale: 2 });
    saveUploadSettings(s);
    expect(localStorage.getItem(UPLOAD_SETTINGS_KEY)).toBeTruthy();
    expect(loadUploadSettings()).toEqual(s);
  });

  it("loads defaults from junk instead of failing the tab", () => {
    localStorage.setItem(UPLOAD_SETTINGS_KEY, "{not json");
    expect(loadUploadSettings().defaults).toEqual(DEFAULT_UPLOAD);
  });

  it("never persists a zoom — display state has no place here", () => {
    saveUploadSettings({ defaults: DEFAULT_UPLOAD, overrides: {} });
    expect(localStorage.getItem(UPLOAD_SETTINGS_KEY)).not.toContain("zoom");
  });
});

describe("the row's settings line", () => {
  it("states the effective numbers in the units the user chose", () => {
    const values = { ...DEFAULT_UPLOAD, stroke: { value: 2.2, unit: "pt" as const, enabled: true }, padding: { value: 10, unit: "pt" as const } };
    expect(settingsLineOf(values)).toBe("stroke 2.2 pt · pad 10 pt · JPEG 15.1 MP");
  });

  it("says 'no stroke' instead of pretending a width is applied", () => {
    const values = { ...DEFAULT_UPLOAD, stroke: { value: 2.2, unit: "pt" as const, enabled: false } };
    expect(settingsLineOf(values)).toContain("no stroke");
  });

  it("reads the same values the export uses — no second vocabulary", () => {
    const values = { ...DEFAULT_UPLOAD, jpeg: { ...DEFAULT_UPLOAD.jpeg, targetMp: 8, quality: 0.8 } };
    expect(settingsLineOf(values)).toContain("8 MP");
  });
});
