// svg_row_bar_alignment.test.tsx — the strips under a row's previews keep ONE
// cell per preview, in the previews' own order and width (user report
// 2026-11-17): the image/style version chips sit under the AI-source preview
// they switch, the SVG bar (Edit + SVG version chips) under the SVG preview,
// and a Base · Stroke preview keeps its own cell — whatever the number of
// previews the row shows. A style row shows three previews, so the old
// two-cell strip shifted every chip set one slot to the left. The style chips
// keep their meaning: the picked version IS the image the next SVG generation
// vectorizes (`mainImageOf`, the run's own rule), as before.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { mainImageOf } from "../src/lib/svgimgreg";
import { styleRowId } from "../src/lib/svgstyles";
import { STYLES_KEY, resetStylePrefs } from "../src/svg/styles";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { FOG, click, host, installSvgPanelHooks, mount, q, settle } from "./helpers/svgpanel";

installSvgPanelHooks();

// the style list is module state as well as localStorage: one clean start per case
beforeEach(() => { window.localStorage.removeItem(STYLES_KEY); resetStylePrefs(); });

const STYLE = "colored_wiggle";
const SID = styleRowId(FOG, STYLE);
const STYLE_DIR = `architecture/_${STYLE}`;
const STYLE_STEM = `fog_AI_${STYLE}`;

const doc = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;
const file = (name: string, text: string) => new FakeFile(name, text.length, 3200, text);
const png = (name: string, seed: string) => new FakeFile(name, 20, 3100, seed);

/** The approved fog row plus its `_colored_wiggle` style folder (2 variants);
    with `styleSvg` the style pair also carries two generated SVG versions. */
function makeRoot(styleSvg: boolean): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("fog_AI.svg", file("fog_AI.svg", doc("#c22f2f")));
  const baseSide = serializePairMeta(pairFile("architecture", "fog_AI.png", {
    versions: [svgVersion("architecture/fog_AI.svg", { version: 1 })],
  }));
  arch.children.set("fog_AI.svg.json", file("fog_AI.svg.json", baseSide));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(`${STYLE_STEM}.png`, png(`${STYLE_STEM}.png`, "s"));
  style.children.set(`${STYLE_STEM}_01.png`, png(`${STYLE_STEM}_01.png`, "s1"));
  style.children.set(`${STYLE_STEM}_02.png`, png(`${STYLE_STEM}_02.png`, "s2"));
  if (styleSvg) {
    style.children.set(`${STYLE_STEM}.svg`, file(`${STYLE_STEM}.svg`, doc("#2f6dc2")));
    style.children.set(`${STYLE_STEM}_v2.svg`, file(`${STYLE_STEM}_v2.svg`, doc("#2fc26d")));
    const side = serializePairMeta(pairFile(STYLE_DIR, `${STYLE_STEM}.png`, {
      id: SID, decision: null, sourceName: null,
      versions: [
        svgVersion(`${STYLE_DIR}/${STYLE_STEM}.svg`, { version: 1 }),
        svgVersion(`${STYLE_DIR}/${STYLE_STEM}_v2.svg`, { version: 2 }),
      ],
    }));
    style.children.set(`${STYLE_STEM}.svg.json`, file(`${STYLE_STEM}.svg.json`, side));
  }
  arch.children.set(`_${STYLE}`, style);
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

const all = (sel: string) => [...host.querySelectorAll(sel)] as HTMLElement[];
/** The preview slots of the one row, in order. */
const slots = () => all(".svg-pair-with-bar .pair-thumbs > .pair-thumb");
/** The bar cells under them, in order. */
const cells = () => all(".svg-pair-with-bar .svg-pair-bars > .svg-pair-bar");
const tags = () => slots().map((s) => s.querySelector(".pair-thumb-tag")?.textContent ?? "");

function styleMeta(root: FakeDir) {
  const f = (root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir;
  const side = f.children.get(`${STYLE_STEM}.svg.json`) as FakeFile;
  const parsed = parsePairMeta(side.text);
  if (!parsed.ok) throw new Error("the style pair file no longer parses");
  return parsed.meta;
}

/** Mount, check the row, register its styles and switch to the style. */
async function mountStyleRow(styleSvg = true): Promise<FakeDir> {
  const root = makeRoot(styleSvg);
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

describe("the strip under the previews keeps one cell per preview", () => {
  it("a style row shows three previews and three bar cells, each as wide as its preview", async () => {
    await mountStyleRow(true);
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v2"]);
    expect(cells()).toHaveLength(3);
    cells().forEach((cell, i) => expect(cell.style.width).toBe(slots()[i].style.width));
  });

  it("every chip set sits under the preview it belongs to — never a slot to the left", async () => {
    await mountStyleRow(true);
    const [base, ai, svg] = cells();
    // Base · Stroke has no versions of its own: its cell stays empty
    expect(base.textContent).toBe("");
    // the style/image versions under the AI-source preview they switch
    expect(ai.querySelector(`[data-testid="svg-ai-bar-${SID}"]`)).not.toBeNull();
    expect(ai.querySelector(`[data-testid="svg-ai-chip-${SID}-orig"]`)).not.toBeNull();
    expect(ai.querySelector(`[data-testid="svg-ai-chip-${SID}-2"]`)).not.toBeNull();
    // Edit and the SVG versions under the SVG preview they act on
    expect(svg.querySelector(`[data-testid="svg-edit-btn-${SID}"]`)).not.toBeNull();
    expect(svg.querySelector(`[data-testid="svg-ver-bar-${SID}"]`)).not.toBeNull();
    expect(svg.querySelector(`[data-testid="svg-ver-chip-${SID}-2"]`)).not.toBeNull();
    // and none of them leaks into a neighbour's cell
    expect(base.querySelector("[data-testid^=svg-ai-bar]")).toBeNull();
    expect(base.querySelector("[data-testid^=svg-ver-bar]")).toBeNull();
    expect(ai.querySelector("[data-testid^=svg-ver-bar]")).toBeNull();
    expect(svg.querySelector("[data-testid^=svg-ai-bar]")).toBeNull();
  });

  it("a base row keeps two previews and two bar cells, aligned the same way", async () => {
    await mount(makeRoot(true));
    await settle();
    expect(tags()).toEqual(["AI source", "SVG v1"]);
    expect(cells()).toHaveLength(2);
    cells().forEach((cell, i) => expect(cell.style.width).toBe(slots()[i].style.width));
    expect(cells()[0].textContent).toBe(""); // no image history yet: no strip
    expect(cells()[1].querySelector(`[data-testid=svg-ver-bar-${FOG}]`)).not.toBeNull();
    expect(cells()[1].querySelector(`[data-testid=svg-edit-btn-${FOG}]`)).not.toBeNull();
  });

  it("switching back to the base style collapses the strip with the previews", async () => {
    await mountStyleRow(true);
    await click(q("[data-testid=svg-style-select]")!);
    await click(q("[data-testid=svg-style-opt-base]")!);
    await settle();
    expect(tags()).toEqual(["AI source", "SVG v1"]);
    expect(cells()).toHaveLength(2);
    expect(cells()[1].querySelector(`[data-testid=svg-ver-bar-${FOG}]`)).not.toBeNull();
  });
});

describe("the chosen style version is the image the next generation reads", () => {
  it("a chip under the AI-source preview makes that variant main, in the pair file and for the run", async () => {
    const root = await mountStyleRow(true);
    expect(styleMeta(root).imagePreferred).toBe(1); // the first variant starts main
    await click(q(`[data-testid="svg-ai-chip-${SID}-2"]`)!);
    await settle();
    const meta = styleMeta(root);
    expect(meta.imagePreferred).toBe(2);
    // the ONE rule the row shows and the generation vectorizes (RC8)
    expect(mainImageOf(meta, `${STYLE_DIR}/${STYLE_STEM}.png`)).toBe(`${STYLE_DIR}/${STYLE_STEM}_02.png`);
    expect(q(`[data-testid="svg-ai-chip-${SID}-2"]`)?.getAttribute("data-active")).toBe("true");
    expect(q(`[data-testid="svg-ai-chip-${SID}-1"]`)?.getAttribute("data-active")).toBe("false");
    // the run builds its sheet from that same rule, not from a copy of its own
    expect(readFileSync("src/svg/runbatch.ts", "utf8")).toContain("mainImageOf(metas.get(s.id) ?? null, s.relPath)");
    // picking never moves the strips out from under their previews
    expect(cells()[1].querySelector(`[data-testid="svg-ai-bar-${SID}"]`)).not.toBeNull();
    expect(cells()[2].querySelector(`[data-testid="svg-ver-bar-${SID}"]`)).not.toBeNull();
  });
});
