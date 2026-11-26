// Every artboard picture on screen gets its icon texts loaded (2026-11-26): a
// folder change empties the loaded texts, and only `previewedArtboards` are
// read again — the stage strip's artboards (the edited template's) must be among
// them even when the list below shows another template's.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { newArtboard } from "../src/lib/svgBuilder/artboards";
import { previewedArtboards, stageTemplateId } from "../src/svgBuilder/artboardview";

const EMPTY = { active: null, anchor: null, checked: [] as string[] };
const config = parseSheetConfig(DEFAULT_CONFIG);
const t1 = newTemplate(config, [], "2026-11-26T00:00:00Z", "t1");
const t2 = newTemplate(config, [], "2026-11-26T00:00:00Z", "t2");
const a1 = newArtboard(t1, [], { now: "2026-11-26T00:00:00Z", id: "a1", placedIds: ["apple"] });
const a2 = newArtboard(t2, [a1], { now: "2026-11-26T00:00:00Z", id: "a2", placedIds: ["gear"] });
const base = { templates: [t1, t2], artboards: [a1, a2], editingTemplateId: null, editingArtboardId: null };

describe("previewedArtboards — the pictures whose icons are loaded", () => {
  it("includes the stage strip's artboards when the list shows another template", () => {
    const m = { ...base, editingTemplateId: "t1", templateSel: { ...EMPTY, active: "t2" } };
    expect(stageTemplateId(m)).toBe("t1");
    expect(previewedArtboards(m).map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("follows the open artboard's template, and lists each artboard once", () => {
    const m = { ...base, editingArtboardId: "a1", templateSel: { ...EMPTY, active: "t1" } };
    expect(previewedArtboards(m).map((a) => a.id)).toEqual(["a1"]);
  });

  it("with nothing on the stage and nothing selected, none", () => {
    expect(previewedArtboards({ ...base, templateSel: EMPTY })).toEqual([]);
  });
});
