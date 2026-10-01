import { describe, expect, it } from "vitest";
import { orderedManifest, responseSchema, stableSvgSourceId, batchPrompt } from "../src/svg/prompt";
import { mapSvgResponse } from "../src/svg/responsemap";
import { SVG_MARKUP, SVG_HASH } from "./helpers/svgfixtures";

const files = [
  { relativePath: "z/leaf_AI.png", filename: "leaf_AI.png", fingerprint: SVG_HASH },
  { relativePath: "a/B_AI.png", filename: "B_AI.png", fingerprint: SVG_HASH },
  { relativePath: "a/a_AI.png", filename: "a_AI.png", fingerprint: SVG_HASH },
];

describe("deterministic request manifests and explicit response mapping", () => {
  it("orders paths canonically independent of input order and assigns stable IDs", () => {
    const first = orderedManifest(files);
    const second = orderedManifest([...files].reverse());
    expect(first).toEqual(second);
    expect(first.map((item) => [item.positionId, item.relativePath])).toEqual([
      [1, "a/a_AI.png"], [2, "a/B_AI.png"], [3, "z/leaf_AI.png"],
    ]);
    expect(first[0].sourceId).toBe(stableSvgSourceId("a/a_AI.png"));
    expect(stableSvgSourceId("A/e\u0301_AI.png")).toBe(stableSvgSourceId("a/é_AI.png"));
  });

  it("puts the unchanged user prompt in the multimodal instruction and constrains the schema IDs", () => {
    const manifest = orderedManifest(files);
    const prompt = "Create 4 split SVG icons. Snap visually intended connections exactly to curves/anchors.";
    expect(batchPrompt(manifest, prompt)).toContain(prompt);
    expect(batchPrompt(manifest, prompt)).toContain("1 — a_AI.png");
    expect(responseSchema(manifest)).toMatchObject({
      type: "json_schema", json_schema: { strict: true, schema: {
        properties: { icons: { items: { properties: { position_id: { enum: [1, 2, 3] } } } } },
      } },
    });
  });

  it("maps out-of-order JSON responses only by position ID and sanitizes each exact title", () => {
    const manifest = orderedManifest([{ relativePath: "a/leaf_AI.png", filename: "leaf_AI.png", fingerprint: SVG_HASH },
      { relativePath: "b/rose_AI.svg", filename: "rose_AI.svg", fingerprint: SVG_HASH }]);
    const flower = `<svg viewBox="0 0 10 10"><title>rose_AI.svg</title><script>bad()</script><circle cx="5" cy="5" r="4"/></svg>`;
    const leaf = SVG_MARKUP.replace("leaf_AI.png", "leaf_AI.png");
    const response = JSON.stringify({ icons: [
      { position_id: 2, title: "rose_AI.svg", svg: flower },
      { position_id: 1, title: "leaf_AI.png", svg: leaf },
    ] });
    const result = mapSvgResponse(response, manifest);
    expect(result.outputs.map((item) => item.positionId)).toEqual([1, 2]);
    expect(result.outputs[1].svg).not.toContain("script");
    expect(result.issues).toEqual([]);
  });

  it("rejects duplicate, unknown, out-of-range and wrong-name mappings without shifting later icons", () => {
    const manifest = orderedManifest(files.slice(0, 2));
    const response = JSON.stringify({ icons: [
      { position_id: 1, title: "B_AI.png", svg: SVG_MARKUP },
      { position_id: 1, title: "a/a_AI.png", svg: SVG_MARKUP },
      { position_id: 2, title: "wrong.png", svg: SVG_MARKUP },
      { position_id: 9, title: "unknown.png", svg: SVG_MARKUP },
      { position_id: 0, title: "zero.png", svg: SVG_MARKUP }
    ] });
    const result = mapSvgResponse(response, manifest);
    expect(result.outputs).toEqual([]);
    expect(result.missing).toEqual([1, 2]);
    expect(result.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(["invalid", "duplicate", "unknown", "out-of-range", "missing"]));
  });

  it("accepts the documented numbered format but never assigns an unlabelled SVG by array order", () => {
    const manifest = orderedManifest([{ relativePath: "a/leaf_AI.png", filename: "leaf_AI.png", fingerprint: SVG_HASH }]);
    const numbered = ["Position ID: 1 — leaf_AI.png", "```svg", SVG_MARKUP, "```"].join("\n");
    expect(mapSvgResponse(numbered, manifest).outputs).toHaveLength(1);
    const unlabelled = mapSvgResponse(SVG_MARKUP, manifest);
    expect(unlabelled.outputs).toEqual([]);
    expect(unlabelled.missing).toEqual([1]);
  });

  it("rejects multiple SVG roots or malformed JSON instead of guessing", () => {
    const manifest = orderedManifest([{ relativePath: "a/leaf_AI.png", filename: "leaf_AI.png", fingerprint: SVG_HASH }]);
    const double = JSON.stringify({ icons: [{ position_id: 1, title: "leaf_AI.png", svg: SVG_MARKUP + SVG_MARKUP }] });
    expect(mapSvgResponse(double, manifest).outputs).toEqual([]);
    expect(mapSvgResponse("{broken", manifest).issues[0].message).toContain("no explicit position IDs");
  });
});
