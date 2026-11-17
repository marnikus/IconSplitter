// svg_style_version_remove.test.tsx — 🗑 on a style row's AI-source version
// (user report 2026-11-17: removing any style variant also wiped the Base ·
// Stroke preview, and it never came back). A removal changes ONE pair file and
// ONE row; the rest of the row — its three previews, their strips, its live
// state — must be exactly what it was, minus the removed chip.
import { beforeEach, describe, expect, it } from "vitest";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { styleRowId } from "../src/lib/svgstyles";
import { STYLES_KEY, resetStylePrefs } from "../src/svg/styles";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { FOG, click, host, installSvgPanelHooks, mount, q, settle } from "./helpers/svgpanel";

installSvgPanelHooks();

// the style list is module state, not only localStorage: start each case clean
beforeEach(() => { window.localStorage.removeItem(STYLES_KEY); resetStylePrefs(); });

const STYLE = "colored_wiggle";
const SID = styleRowId(FOG, STYLE);
const STYLE_DIR = `architecture/_${STYLE}`;
const STYLE_STEM = `fog_AI_${STYLE}`;

const doc = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;
const text = (name: string, body: string) => new FakeFile(name, body.length, 3200, body);
const png = (name: string, seed: string) => new FakeFile(name, 20, 3100, seed);

/** The approved fog row plus a `_colored_wiggle` style folder with two variants and one SVG. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("fog_AI.svg", text("fog_AI.svg", doc("#c22f2f")));
  arch.children.set("fog_AI.svg.json", text("fog_AI.svg.json", serializePairMeta(pairFile("architecture", "fog_AI.png", {
    versions: [svgVersion("architecture/fog_AI.svg", { version: 1 })],
  }))));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(`${STYLE_STEM}.png`, png(`${STYLE_STEM}.png`, "s"));
  style.children.set(`${STYLE_STEM}_01.png`, png(`${STYLE_STEM}_01.png`, "s1"));
  style.children.set(`${STYLE_STEM}_02.png`, png(`${STYLE_STEM}_02.png`, "s2"));
  style.children.set(`${STYLE_STEM}.svg`, text(`${STYLE_STEM}.svg`, doc("#2f6dc2")));
  style.children.set(`${STYLE_STEM}.svg.json`, text(`${STYLE_STEM}.svg.json`, serializePairMeta(
    pairFile(STYLE_DIR, `${STYLE_STEM}.png`, { id: SID, decision: null, sourceName: null,
      versions: [svgVersion(`${STYLE_DIR}/${STYLE_STEM}.svg`, { version: 1 })] }),
  )));
  arch.children.set(`_${STYLE}`, style);
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

const all = (sel: string) => [...host.querySelectorAll(sel)] as HTMLElement[];
const tags = () => all(".svg-pair-with-bar .pair-thumbs > .pair-thumb").map((s) => s.querySelector(".pair-thumb-tag")?.textContent ?? "");
/** The Base · Stroke preview the user says disappears. */
const baseSide = () => q(`[data-testid="svg-base-ai-${SID}"]`);

function styleMeta(root: FakeDir) {
  const f = (root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir;
  const parsed = parsePairMeta((f.children.get(`${STYLE_STEM}.svg.json`) as FakeFile).text);
  if (!parsed.ok) throw new Error("the style pair file no longer parses");
  return parsed.meta;
}

/** Mount, check the row, register its styles and switch to the style. */
async function mountStyleRow(): Promise<FakeDir> {
  const root = makeRoot();
  await mount(root);
  await settle();
  await click(q(`[data-testid=svg-check-${FOG}]`)!);
  await click(q("[data-testid=svg-register-styles]")!);
  await settle();
  await settle();
  await click(q("[data-testid=svg-style-select]")!);
  await click(q(`[data-testid=svg-style-opt-${STYLE}]`)!);
  await settle();
  await settle();
  return root;
}

describe("removing a style AI-source version", () => {
  it("keeps the Base · Stroke preview and the rest of the row — one version leaves, nothing else", async () => {
    const root = await mountStyleRow();
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
    expect(baseSide()).not.toBeNull();
    expect(q(`[data-testid="svg-ai-chip-${SID}-2"]`)).not.toBeNull();
    await click(q(`[data-testid="svg-ai-trash-${SID}-2"]`)!);
    await settle();
    // the removed chip is gone…
    expect(q(`[data-testid="svg-ai-chip-${SID}-2"]`)).toBeNull();
    expect(styleMeta(root).imageVersions.map((v) => v.version)).toEqual([1]);
    // …and the row is still the same three-preview style row, Base · Stroke included
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
    expect(baseSide()).not.toBeNull();
    expect(q(`[data-testid="svg-base-ai-img-${SID}"]`)).not.toBeNull();
    expect(q(`[data-testid="svg-ai-chip-${SID}-1"]`)).not.toBeNull();
    expect(q(`[data-testid="svg-ver-bar-${SID}"]`)).not.toBeNull();
  });

  it("keeps it when the last variant goes too, and undo brings the whole row back", async () => {
    const root = await mountStyleRow();
    await click(q(`[data-testid="svg-ai-trash-${SID}-2"]`)!);
    await settle();
    await click(q(`[data-testid="svg-ai-trash-${SID}-1"]`)!);
    await settle();
    expect(styleMeta(root).imageVersions).toEqual([]);
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
    expect(baseSide()).not.toBeNull();
    // undo puts both versions back — the row is still the same three-preview style row
    await click(q("[data-testid=hist-undo]")!);
    await settle();
    await click(q("[data-testid=hist-undo]")!);
    await settle();
    await settle();
    expect(styleMeta(root).imageVersions.map((v) => v.version)).toEqual([1, 2]);
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
    expect(q(`[data-testid="svg-ai-chip-${SID}-2"]`)).not.toBeNull();
    expect(baseSide()).not.toBeNull();
    // the base row itself never lost its own artwork (the style's own file)
    const arch = root.children.get("architecture") as FakeDir;
    expect(arch.children.get("fog_AI.png")).toBeInstanceOf(FakeFile);
  });
});
