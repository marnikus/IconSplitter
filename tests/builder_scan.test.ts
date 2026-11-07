// @vitest-environment node
// builder_scan.test.ts — RULE 8: the builder's library is exactly the approved
// icons, discovered for real over a fake folder tree (the same sidecars SVG to
// upload reads), and its own `builder/` output folder is never read back in.
import { describe, expect, it } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { discoverBuilderIcons, BUILDER_IGNORE } from "../src/builder/scan";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion, type VerOpts } from "./helpers/svgpair";

const DIR = "weather";
const AI = "fog_AI.png";
const STEM = "fog_AI";

function approve(dir: string, aiName: string, versions: Parameters<typeof svgVersion>[1][]): string {
  const stem = aiName.replace(/\.png$/i, "");
  const meta = pairFile(dir, aiName, {
    versions: versions.map((o, i) => svgVersion(`${dir}/${stem}_v${o?.version ?? i + 1}.svg`, o)),
  });
  return serializePairMeta(meta);
}

/** One pair folder: the AI image, its sidecar and the SVG files named. */
function pairDir(root: FakeDir, dir: string, aiName: string, files: Record<string, string>, sidecarText: string): FakeDir {
  let node = root;
  for (const part of dir.split("/").filter(Boolean)) {
    const found = node.children.get(part);
    if (found instanceof FakeDir) { node = found; continue; }
    const made = new FakeDir(part);
    node.children.set(part, made);
    node = made;
  }
  const stem = aiName.replace(/\.png$/i, "");
  node.children.set(aiName, new FakeFile(aiName, 20, 3100, "ai"));
  node.children.set(`${stem}.svg.json`, new FakeFile(`${stem}.svg.json`, 10, 3300, sidecarText));
  for (const [name, text] of Object.entries(files)) node.children.set(name, new FakeFile(name, text.length, 3400, text));
  return node;
}

const approved = (o: VerOpts = {}) => ({ review: "approved" as const, ...o });

/** Two approved pairs, one pending pair, and one approved pair with no valid SVG. */
function root(): FakeDir {
  const r = new FakeDir("icons_test");
  pairDir(r, DIR, AI, { [`${STEM}.svg`]: "<svg/>", [`${STEM}_v2.svg`]: "<svg/>" },
    approve(DIR, AI, [approved({ version: 1 }), approved({ version: 2 })]));
  const kitchen = "kitchen";
  pairDir(r, kitchen, "pot_AI.png", { "pot_AI.svg": "<svg/>" },
    approve(kitchen, "pot_AI.png", [approved({ version: 1 })]));
  pairDir(r, "unreviewed", "mist_AI.png", { "mist_AI.svg": "<svg/>" },
    approve("unreviewed", "mist_AI.png", [{ review: "pending", version: 1 }]));
  pairDir(r, "broken", "dust_AI.png", {},
    approve("broken", "dust_AI.png", [{ review: "approved", version: 1, valid: false }]));
  return r;
}

describe("discoverBuilderIcons — the approved library", () => {
  it("lists one icon per approved pair with a valid SVG, in a deterministic order", async () => {
    const found = await discoverBuilderIcons(root());
    expect(found.icons.map((i) => i.folder)).toEqual(["kitchen", "weather"]);
    expect(found.icons.map((i) => i.name)).toEqual(["pot", "fog"]);
    expect(found.icons[1]).toMatchObject({ folder: DIR, version: 2, svgPath: `${DIR}/${STEM}_v2.svg` });
  });

  it("says why a pair is not listed instead of hiding it", async () => {
    const found = await discoverBuilderIcons(root());
    expect(found.excluded.map((e) => e.kind).sort()).toEqual(["no-approved-svg", "no-valid-svg"]);
    expect(found.excluded.every((e) => e.reason !== "")).toBe(true);
  });

  it("keeps the audit counts the source bar shows", async () => {
    const found = await discoverBuilderIcons(root());
    expect(found.scope).toMatchObject({ icons: 2, excluded: 2, corrupt: 0, unreadable: 0 });
    expect(found.scope.files).toBeGreaterThanOrEqual(found.scope.svgFiles);
  });

  it("never reads its own output folder back in", async () => {
    const r = root();
    const builder = new FakeDir("builder");
    builder.children.set("icon-sheet.svg", new FakeFile("icon-sheet.svg", 9, 4000, "<svg/>"));
    r.children.set("builder", builder);
    const found = await discoverBuilderIcons(r);
    expect(found.icons).toHaveLength(2);
    expect(BUILDER_IGNORE).toContain("builder");
    expect(found.scope.files).toBeLessThan(20); // the sheet inside builder/ was not walked
  });

  it("an empty root is an empty library, not a failure", async () => {
    const found = await discoverBuilderIcons(new FakeDir("empty"));
    expect(found.icons).toEqual([]);
    expect(found.scope.icons).toBe(0);
    expect(found.excluded).toEqual([]);
  });

  it("uses the metadata cache when the caller has read it", async () => {
    const found = await discoverBuilderIcons(root(), { tagsOf: (icon) => icon.folder === "kitchen" ? ["pot", "cook"] : null });
    const pot = found.icons.find((i) => i.name === "pot");
    expect(pot?.tags).toEqual(["pot", "cook"]);
    expect(pot?.tagSource).toBe("metadata");
  });
});
