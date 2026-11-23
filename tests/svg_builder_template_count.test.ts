// svg_builder_template_count.test.ts — no cap on the number of saved templates
// (2026-11-23; was 60): every valid template is kept on read and on write.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { newTemplate, parseTemplates } from "../src/lib/svgBuilder/templates";
import { BUILDER_TEMPLATES_KEY, loadTemplates, saveTemplates } from "../src/svgBuilder/templatestore";

describe("saved templates have no count limit (2026-11-23)", () => {
  it("keeps every one of 250 templates through parse, save and load", () => {
    const names: string[] = [];
    const many = Array.from({ length: 250 }, (_, i) => {
      const t = newTemplate(DEFAULT_CONFIG, names, "2026-11-23T00:00:00.000Z", `tpl-${i}`);
      names.push(t.name);
      return t;
    });
    expect(parseTemplates(many)).toHaveLength(250);
    localStorage.removeItem(BUILDER_TEMPLATES_KEY);
    saveTemplates(many);
    expect(loadTemplates()).toHaveLength(250);
  });
});
