// @vitest-environment node
// builder_rows.test.ts — RULE 8: the pure projection from an approved pair to a
// library icon, and the free-text/facet filtering the left rail uses. No DOM, no
// disk: an icon is a value here, so the interesting rules (which name shows, where
// the search tokens came from, what an empty query does) are all testable.
import { describe, expect, it } from "vitest";
import {
  emptyFilter, filterIcons, iconFacets, searchTokensOf, toBuilderIcon, type BuilderIcon,
} from "../src/lib/builder/rows";
import { nameOf } from "../src/lib/builder/name";
import type { UploadRowSource } from "../src/upload/discovery";

describe("toBuilderIcon — one approved pair, one library icon", () => {
  it("keeps the identity that decides which artwork it is", () => {
    const icon = toBuilderIcon({
      id: "pair_fog", base: "fog", suffix: "", dirPath: "architecture", version: 2,
      svgPath: "architecture/fog_AI_v2.svg", svgName: "fog_AI_v2.svg", fingerprint: "10:3400",
      aiPath: "architecture/fog_AI.png", metaPath: "architecture/fog_AI.svg.json", approvedValid: 2,
    }, null);
    expect(icon).toMatchObject({
      id: "pair_fog",
      svgPath: "architecture/fog_AI_v2.svg",
      folder: "architecture",
      fingerprint: "10:3400",
      version: 2,
    });
  });

  it("shows the pair's own base name, not the app's _AI marker or the version tail", () => {
    expect(nameOf("fog")).toBe("fog");
    expect(nameOf("icon-bunny-face")).toBe("icon bunny face");
    expect(nameOf("chat_bot_2")).toBe("chat bot 2");
    expect(nameOf("Fog_Bank")).toBe("fog bank");
  });

  it("uses generated metadata tags when the pair has them", () => {
    const icon = toBuilderIcon(baseRow(), { title: "Fog bank", tags: ["fog", "weather", "mist"] });
    expect(icon.tags).toEqual(["fog", "weather", "mist"]);
    expect(icon.tagSource).toBe("metadata");
  });

  it("falls back to filename tokens and says so, instead of pretending about tags", () => {
    const icon = toBuilderIcon(baseRow(), null);
    expect(icon.tags).toEqual(["architecture", "fog"]);
    expect(icon.tagSource).toBe("filename");
  });

  it("falls back to the SVG's own name when the pair has no base", () => {
    const icon = toBuilderIcon(baseRow({ base: "", dirPath: "" }), null);
    expect(icon.name).toBe("fog ai v2");
    expect(icon.tagSource).toBe("filename");
  });

  it("says 'none' — not 'filename' — when there is nothing to search at all", () => {
    const icon = toBuilderIcon(baseRow({ base: "", dirPath: "", svgName: "" }), null);
    expect(icon.tags).toEqual([]);
    expect(icon.tagSource).toBe("none");
  });

  it("never repeats a token that is both a folder and a word", () => {
    expect(searchTokensOf("fog", "fog")).toEqual(["fog"]);
  });
});

describe("filterIcons — what the rail shows", () => {
  const icons = [weatherFog(), kitchenPot(), kitchenPan()];

  it("an empty filter keeps every icon, in the scan's order", () => {
    expect(filterIcons(icons, emptyFilter).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by folder and by tag independently", () => {
    expect(filterIcons(icons, { ...emptyFilter, folder: "kitchen" }).map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterIcons(icons, { ...emptyFilter, tag: "fog" }).map((i) => i.id)).toEqual(["a"]);
  });

  it("searches name, folder and tags together, case-insensitively", () => {
    expect(filterIcons(icons, { ...emptyFilter, search: "PAN" }).map((i) => i.id)).toEqual(["c"]);
    expect(filterIcons(icons, { ...emptyFilter, search: "kitchen" }).map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterIcons(icons, { ...emptyFilter, search: "nothing-matches" })).toEqual([]);
  });

  it("a search that matches nothing is an empty list, never the whole library", () => {
    expect(filterIcons(icons, { ...emptyFilter, search: "zzz" })).toHaveLength(0);
  });
});

describe("iconFacets — the chip lists", () => {
  it("lists every folder and tag once, sorted, with counts", () => {
    const facets = iconFacets([weatherFog(), kitchenPot(), kitchenPan()]);
    expect(facets.folders).toEqual([["kitchen", 2], ["weather", 1]]);
    expect(facets.tags).toEqual([["fog", 1], ["kitchen", 2], ["pan", 1], ["pot", 1], ["weather", 1]]);
  });
});

/** The scan row the builder reads, with `over` applied last so a case can empty a field. */
function baseRow(over: Partial<UploadRowSource> = {}): UploadRowSource {
  return {
    id: "pair_fog", base: "fog", suffix: "", dirPath: "architecture", version: 2,
    svgPath: "architecture/fog_AI_v2.svg", svgName: "fog_AI_v2.svg", fingerprint: "10:3400",
    aiPath: "architecture/fog_AI.png", metaPath: "architecture/fog_AI.svg.json", approvedValid: 2,
    ...over,
  };
}

function icon(id: string, name: string, folder: string, tags: string[], tagSource: BuilderIcon["tagSource"] = "metadata"): BuilderIcon {
  return { id, svgPath: `${folder}/${name}.svg`, name, folder, tags, tagSource, fingerprint: "1:2", version: 1 };
}

const weatherFog = () => icon("a", "fog", "weather", ["fog", "weather"]);
const kitchenPot = () => icon("b", "pot", "kitchen", ["pot", "kitchen"]);
const kitchenPan = () => icon("c", "pan", "kitchen", ["pan", "kitchen"]);
