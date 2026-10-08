// upload_promptstore.test.ts — the metadata prompt and its presets (RULE 13):
// the stored prompt falls back to the documented default when it is missing,
// empty or corrupt; presets are validated entry by entry, deduplicated by name,
// bounded in count and length, and the workbench survives a junk payload with
// one ignored load. The prompt is text the user owns — nothing here can hold a
// key, and an unusable value never reaches the request builder.
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_METADATA_PROMPT } from "../src/lib/upload/meta";
import {
  PRESET_LIMIT, PROMPT_MAX_CHARS, findPreset, isDefaultPrompt, parsePresets,
  parsePromptText, presetNames, removePreset, serializePresets, serializePromptText,
  upsertPreset, validPresetName, type PromptPreset,
} from "../src/lib/upload/promptpresets";
import { PROMPT_KEY, PRESETS_KEY, loadPresets, loadPrompt, savePresets, savePrompt } from "../src/upload/promptstore";

const CUSTOM = "Write metadata for a minimalist line icon. Answer in three lines.";

const P = (name: string, text = "text"): PromptPreset => ({ name, text });

beforeEach(() => {
  localStorage.clear();
});

describe("the stored prompt", () => {
  it("a missing, empty, junk or foreign payload is the documented default", () => {
    expect(parsePromptText(null)).toBe(DEFAULT_METADATA_PROMPT);
    expect(parsePromptText({ v: 1, prompt: "" })).toBe(DEFAULT_METADATA_PROMPT);
    expect(parsePromptText({ v: 1, prompt: "   \n  " })).toBe(DEFAULT_METADATA_PROMPT);
    expect(parsePromptText({ v: 99, prompt: CUSTOM })).toBe(DEFAULT_METADATA_PROMPT);
    expect(parsePromptText({ prompt: 7 })).toBe(DEFAULT_METADATA_PROMPT);
  });

  it("keeps the user's own text verbatim, leading and trailing whitespace included", () => {
    const padded = `\n${CUSTOM}\n`;
    expect(parsePromptText({ v: 1, prompt: padded })).toBe(padded);
    expect(isDefaultPrompt(CUSTOM)).toBe(false);
    expect(isDefaultPrompt(DEFAULT_METADATA_PROMPT)).toBe(true);
  });

  it("a round trip through the stored shape is exact", () => {
    expect(parsePromptText(JSON.parse(serializePromptText(CUSTOM)))).toBe(CUSTOM);
  });
});

describe("the preset list", () => {
  it("drops every entry that is not a usable preset and keeps the last of a duplicated name", () => {
    expect(parsePresets({ v: 1, presets: [P("a"), null, 7, { name: "  " }, { name: "b", text: 9 }, P("a", "newer")] }))
      .toEqual([P("a", "newer"), { name: "b", text: "" }]);
    expect(parsePresets({ v: 1, presets: "junk" })).toEqual([]);
    expect(parsePresets(null)).toEqual([]);
    expect(parsePresets({ presets: [P("a")] })).toEqual([]); // no version: not ours
  });

  it("trims names and clamps text to the documented maximum", () => {
    const long = "x".repeat(PROMPT_MAX_CHARS + 500);
    const [one] = parsePresets({ v: 1, presets: [{ name: "  strict  ", text: long }] });
    expect(one.name).toBe("strict");
    expect(one.text).toHaveLength(PROMPT_MAX_CHARS);
  });

  it("stays bounded: the newest presets fit, the rest are dropped", () => {
    const many = Array.from({ length: PRESET_LIMIT + 5 }, (_, i) => P(`p${i}`));
    const kept = parsePresets({ v: 1, presets: many });
    expect(kept).toHaveLength(PRESET_LIMIT);
    expect(kept[0].name).toBe("p0");
    expect(kept.at(-1)?.name).toBe(`p${PRESET_LIMIT - 1}`);
  });

  it("a round trip through the stored shape is exact", () => {
    const list = [P("a", "one"), P("b", "two")];
    expect(parsePresets(JSON.parse(serializePresets(list)))).toEqual(list);
  });

  it("saving a NEW name puts it first; saving an existing name replaces it in place", () => {
    let list = upsertPreset([P("a", "one"), P("b", "two")], "c", "three");
    expect(presetNames(list)).toEqual(["c", "a", "b"]);
    list = upsertPreset(list, "a", "one-edited");
    expect(presetNames(list)).toEqual(["c", "a", "b"]);
    expect(findPreset(list, "a")).toEqual(P("a", "one-edited"));
  });

  it("deleting removes exactly the named preset and leaves the rest alone", () => {
    const list = removePreset([P("a"), P("b")], "a");
    expect(presetNames(list)).toEqual(["b"]);
    expect(removePreset(list, "missing")).toEqual(list);
    expect(findPreset(list, "missing")).toBeNull();
  });

  it("a preset name is usable only when it is 1–60 characters after trimming", () => {
    expect(validPresetName("  strict  ")).toBe("strict");
    expect(validPresetName("   ")).toBeNull();
    expect(validPresetName("x".repeat(61))).toBeNull();
    expect(validPresetName("x".repeat(60))).toBe("x".repeat(60));
  });
});

describe("the storage seams", () => {
  it("an empty device opens on the default prompt and no presets", () => {
    expect(loadPrompt()).toBe(DEFAULT_METADATA_PROMPT);
    expect(loadPresets()).toEqual([]);
  });

  it("saves and reads both values back", () => {
    savePrompt(CUSTOM);
    savePresets([P("strict", CUSTOM)]);
    expect(loadPrompt()).toBe(CUSTOM);
    expect(loadPresets()).toEqual([P("strict", CUSTOM)]);
    expect(localStorage.getItem(PROMPT_KEY)).toContain("prompt");
    expect(localStorage.getItem(PRESETS_KEY)).toContain("strict");
  });

  it("a corrupt payload costs one ignored load — never a throw (RULE 13)", () => {
    localStorage.setItem(PROMPT_KEY, "{not json");
    localStorage.setItem(PRESETS_KEY, "{not json");
    expect(loadPrompt()).toBe(DEFAULT_METADATA_PROMPT);
    expect(loadPresets()).toEqual([]);
  });

  it("an empty save is the default again, not a stored empty prompt", () => {
    savePrompt(CUSTOM);
    savePrompt("   ");
    expect(loadPrompt()).toBe(DEFAULT_METADATA_PROMPT);
  });
});
