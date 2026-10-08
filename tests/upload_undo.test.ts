// upload_undo.test.ts — the `uploadSettings` history entry's apply path
// (design §6, RULE 12): the payload is validated before anything moves, a
// mounted panel applies through its live binding, an unmounted undo writes the
// store directly, and a no-op or corrupt payload returns false so the history
// cursor never moves on a change that did not happen.
import { beforeEach, describe, expect, it } from "vitest";
import { applyEntry, ENTRY_TYPES } from "../src/state/apply";
import { HISTORY_VERSION, type HistoryEntry } from "../src/lib/history";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { loadOverrides } from "../src/upload/settingsstore";
import {
  applyUploadSettingsPatch, bindUploadSettingsApplier, overridesEqual, toUploadSettingsPatch,
  type UploadSettingsPatch,
} from "../src/upload/uploadundo";

beforeEach(() => localStorage.clear());

const entry = (ids: string[] = ["pair_a"]): HistoryEntry => ({
  id: "act", type: "uploadSettings", label: "Apply settings", at: "2026-10-01T12:00:00.000Z",
  origin: "upload", ids, before: null, after: null, v: HISTORY_VERSION,
});

const PATCH: UploadSettingsPatch = { overrides: { pair_a: { paddingPct: 30 }, pair_b: null } };

describe("toUploadSettingsPatch — the payload gate", () => {
  it("accepts a well-formed payload", () => {
    expect(toUploadSettingsPatch({ overrides: { pair_a: { paddingPct: 30 }, pair_b: null } })).toEqual(PATCH);
  });

  it("clamps the override values on the way in", () => {
    expect(toUploadSettingsPatch({ overrides: { pair_a: { paddingPct: 999, background: "nope" } } }))
      .toEqual({ overrides: { pair_a: { paddingPct: 50 } } });
  });

  it("refuses payloads that carry nothing usable", () => {
    expect(toUploadSettingsPatch(null)).toBeNull();
    expect(toUploadSettingsPatch("x")).toBeNull();
    expect(toUploadSettingsPatch({})).toBeNull();
    expect(toUploadSettingsPatch({ overrides: "junk" })).toBeNull();
    expect(toUploadSettingsPatch({ overrides: {} })).toBeNull();
    expect(toUploadSettingsPatch({ overrides: { pair_a: "junk", pair_b: {} } })).toBeNull();
  });
});

describe("overridesEqual", () => {
  it("compares field by field, ignoring key order", () => {
    expect(overridesEqual({ paddingPct: 8, includeEps: true }, { includeEps: true, paddingPct: 8 })).toBe(true);
    expect(overridesEqual({ paddingPct: 8 }, { paddingPct: 9 })).toBe(false);
    expect(overridesEqual({}, {})).toBe(true);
    // The artboard is an overrideable field like any other — a change that
    // touches ONLY it must not compare equal (that is how it got swallowed).
    const square = { mode: "preset", size: 512, width: 512, height: 512 } as const;
    const wide = { mode: "custom", size: 512, width: 1024, height: 576 } as const;
    expect(overridesEqual({ artboard: square }, { artboard: { ...square } })).toBe(true);
    expect(overridesEqual({ artboard: square }, { artboard: { ...square, size: 1024 } })).toBe(false);
    expect(overridesEqual({ artboard: square }, { artboard: wide })).toBe(false);
    expect(overridesEqual({ artboard: square }, {})).toBe(false);
    // …and so is the JPEG resolution choice
    expect(overridesEqual({ jpegMatchArtboard: false }, { jpegMatchArtboard: false })).toBe(true);
    expect(overridesEqual({ jpegMatchArtboard: true }, { jpegMatchArtboard: false })).toBe(false);
    expect(overridesEqual({ jpegMatchArtboard: true }, {})).toBe(false);
  });
});

describe("applyUploadSettingsPatch", () => {
  it("applies through the live binding when a panel is mounted", async () => {
    const seen: UploadSettingsPatch[] = [];
    const unbind = bindUploadSettingsApplier((patch) => { seen.push(patch); });
    try {
      expect(await applyUploadSettingsPatch(PATCH)).toBe(true);
      expect(seen).toEqual([PATCH]);
      expect(loadOverrides()).toEqual({}); // the panel's own persist effect owns the write
    } finally {
      unbind();
    }
  });

  it("writes the store directly when no panel is mounted (the next mount reads it)", async () => {
    expect(await applyUploadSettingsPatch(PATCH)).toBe(true);
    expect(loadOverrides()).toEqual({ pair_a: { paddingPct: 30 } });
  });

  it("returns false when nothing would change, so the cursor does not move", async () => {
    await applyUploadSettingsPatch(PATCH);
    expect(await applyUploadSettingsPatch(PATCH)).toBe(false);
    expect(await applyUploadSettingsPatch({ overrides: { pair_a: null } })).toBe(true); // a real delete
    expect(loadOverrides()).toEqual({});
  });

  it("unbind releases the binding", async () => {
    const unbind = bindUploadSettingsApplier(() => { throw new Error("must not be called"); });
    unbind();
    expect(await applyUploadSettingsPatch(PATCH)).toBe(true); // persist path, not the applier
    expect(loadOverrides()).toEqual({ pair_a: { paddingPct: 30 } });
  });
});

describe("applyEntry — the uploadSettings route", () => {
  it("is a recorded entry type", () => {
    expect(ENTRY_TYPES).toContain("uploadSettings");
  });

  it("applies a valid payload (undo restores the before side)", async () => {
    await applyEntry(entry(), { overrides: { pair_a: { paddingPct: 30 } } });
    expect(loadOverrides()).toEqual({ pair_a: { paddingPct: 30 } });
    await applyEntry(entry(), { overrides: { pair_a: null } });
    expect(loadOverrides()).toEqual({});
  });

  it("refuses a corrupt payload — the cursor stays where it was", async () => {
    await applyEntry(entry(), { overrides: { pair_a: { paddingPct: 30 } } });
    await expect(applyEntry(entry(), { mystery: true })).resolves.toBe(false);
    await expect(applyEntry(entry(), null)).resolves.toBe(false);
    expect(loadOverrides()).toEqual({ pair_a: { paddingPct: 30 } }); // untouched
  });

  it("still refuses an entry type from a future schema", async () => {
    await expect(applyEntry({ ...entry(), type: "uploadSettingsV2" }, PATCH)).resolves.toBe(false);
  });
});

describe("the defaults stay out of the undo timeline (design §6)", () => {
  it("a defaults change is a store write, not a history entry — nothing to apply", async () => {
    // the action dispatches a model action; no entry type exists for it
    expect(ENTRY_TYPES).not.toContain("uploadDefaults");
    expect(DEFAULT_UPLOAD_SETTINGS.paddingPct).toBe(8);
  });
});
