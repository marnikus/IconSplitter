// Captions under the icons use the export metadata's one-word Icon Name
// (2026-11-13). Without a name the caption keeps the old label (title or file name).
import { describe, expect, it } from "vitest";
import { assetFromRow, captionOf } from "../src/lib/svgBuilder/assets";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";

const row = (id: string, base: string) => ({
  id, base, suffix: "", dirPath: "icons/food", svgPath: `icons/food/${base}_AI.svg`, svgName: `${base}_AI.svg`,
  version: 1, fingerprint: `f-${id}`, metaPath: `icons/food/${base}_AI.svg.json`,
});
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';

describe("captions", () => {
  const named = assetFromRow(row("a", "bread-slice"), { title: "Minimalist outline of a single piece of fresh toast", description: "", tags: ["bread"], name: "toast" });
  const titled = assetFromRow(row("b", "apple"), { title: "Apple in a box icon", description: "", tags: [] });
  const bare = assetFromRow(row("c", "cake-slice"));

  it("use the Icon Name when the export metadata has one, else the label", () => {
    expect(captionOf(named)).toBe("toast");
    expect(captionOf(titled)).toBe("Apple in a box icon");
    expect(captionOf(bare)).toBe(bare.label);
    expect(named.label).toBe("Minimalist outline of a single piece of fresh toast"); // the library still shows the title
  });

  it("are what the sheet draws under each icon", () => {
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, captions: true, captionCase: "upper" } });
    const doc = composeSheet({
      config, layout: computeLayout(config), assets: [named, titled], placedIds: ["a", "b"], svgTexts: { a: SVG, b: SVG },
    });
    const captions = /<g data-export="captions">([\s\S]*?)<\/g>/.exec(doc.svg)?.[1] ?? "";
    expect(captions).toContain(">TOAST<");
    expect(captions).not.toContain("MINIMALIST");
    expect(captions).toContain(">APPLE IN A BOX ICON<");
  });
});
