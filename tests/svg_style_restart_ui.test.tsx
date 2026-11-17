// svg_style_restart_ui.test.tsx — a restart shows a registered style again
// (user report 2026-11-17: after restarting the app every style image had to be
// registered once more before it showed, although its pair file was on disk).
// The panel is really unmounted and mounted again on the same folder: the style
// bar still knows the style, picking it shows the three-preview style row, and
// nothing is written to disk by merely opening the tab.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { styleRowId } from "../src/lib/svgstyles";
import { STYLES_KEY, resetStylePrefs, stylePrefs } from "../src/svg/styles";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { FOG, click, host, installSvgPanelHooks, mount, q, settle, unmountPanel } from "./helpers/svgpanel";

installSvgPanelHooks();

// the style list lives in module state as well as in localStorage: one clean start per case
beforeEach(() => { window.localStorage.removeItem(STYLES_KEY); resetStylePrefs(); });

const STYLE = "colored_wiggle";
const SID = styleRowId(FOG, STYLE);
const STYLE_DIR = `architecture/_${STYLE}`;
const STYLE_STEM = `fog_AI_${STYLE}`;
const STYLE_FILE = `${STYLE_STEM}.svg.json`;

const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#2f6dc2"/></svg>`;
const text = (name: string, body: string) => new FakeFile(name, body.length, 3200, body);
const png = (name: string, seed: string) => new FakeFile(name, 20, 3100, seed);

/** architecture/fog approved, plus a `_colored_wiggle` folder with two variants and one SVG. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("fog_AI.svg", text("fog_AI.svg", doc));
  arch.children.set("fog_AI.svg.json", text("fog_AI.svg.json", serializePairMeta(pairFile("architecture", "fog_AI.png", {
    versions: [svgVersion("architecture/fog_AI.svg", { version: 1 })],
  }))));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(`${STYLE_STEM}.png`, png(`${STYLE_STEM}.png`, "s"));
  style.children.set(`${STYLE_STEM}_01.png`, png(`${STYLE_STEM}_01.png`, "s1"));
  style.children.set(`${STYLE_STEM}_02.png`, png(`${STYLE_STEM}_02.png`, "s2"));
  style.children.set(`${STYLE_STEM}.svg`, text(`${STYLE_STEM}.svg`, doc));
  style.children.set(STYLE_FILE, text(STYLE_FILE, serializePairMeta(
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
const styleText = (root: FakeDir) => ((root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir)
  .children.get(STYLE_FILE) as FakeFile;

/** Mount, check the row, register its styles and pick the style — then restart the tab.
    Answers the style pair file as it was just before the restart. */
async function registerThenRestart(root: FakeDir): Promise<string> {
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
  expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
  const written = styleText(root).text;
  await unmountPanel(); // ← the restart
  await mount(root);
  await settle();
  await settle();
  return written;
}

describe("a restart picks the registered style up again", () => {
  it("the style bar knows it and picking it shows the style row with its comparison side", async () => {
    const root = makeRoot();
    await registerThenRestart(root);
    // restored, not re-registered: the pair file is the registration
    expect(stylePrefs()).toEqual({ styles: [STYLE], active: STYLE });
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
    expect(q(`[data-testid="svg-base-ai-${SID}"]`)).not.toBeNull();
    expect(q(`[data-testid="svg-ai-chip-${SID}-2"]`)).not.toBeNull();
    expect(q(`[data-testid="svg-ai-bar-${SID}"]`)).not.toBeNull();
  });

  it("opening the tab writes nothing: the pair file on disk is byte-for-byte what it was", async () => {
    const root = makeRoot();
    const before = await registerThenRestart(root);
    expect(styleText(root).text).toBe(before); // the restart read it, never rewrote it
    const parsed = parsePairMeta(before);
    expect(parsed.ok && parsed.meta.imageVersions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("a cleared style list is rebuilt from the folders, so a lost cache costs no registration", async () => {
    const root = makeRoot();
    await registerThenRestart(root);
    window.localStorage.removeItem(STYLES_KEY);
    resetStylePrefs();
    await unmountPanel();
    await mount(root);
    await settle();
    await settle();
    expect(stylePrefs().styles).toEqual([STYLE]);
    // the row is the base row now (the pick was lost with the list)…
    expect(q(`[data-testid=svg-check-${FOG}]`)).not.toBeNull();
    // …and choosing the style needs no registration pass
    await click(q("[data-testid=svg-style-select]")!);
    await click(q(`[data-testid=svg-style-opt-${STYLE}]`)!);
    await settle();
    expect(tags()).toEqual(["Base · Stroke", "AI source", "SVG v1"]);
    expect(q("[data-testid=svg-register-styles]")).not.toBeNull(); // the button is still there, just unused
    expect(readFileSync("src/svg/scan.ts", "utf8")).not.toContain("loadStyleMetas");
  });
});
