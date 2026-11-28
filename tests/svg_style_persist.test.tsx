// svg_style_persist.test.tsx — two style-row bugs (user report 2026-11-17):
// (1) removing any variant of a style's AI source (🗑) rebuilt the row with a
// plain `toRow`, dropping the `baseAiPath` enrichment — the Base · Stroke
// preview vanished and stayed gone; every in-place rebuild (removals, runs,
// registers) must keep it (styles.rebuiltRow). (2) after a restart the scan
// looked for the style pair file under ONE guessed name (`<stem>_<style>.png`),
// but a style image may carry a version (`<stem>_v2_<style>.png` — what real
// workspaces and the registration rule produce), so registered styles lost
// their rows until re-registered; the scan now asks the folder for the name
// the registration rule itself computes.
// first: this helper installs the in-memory folder store before any app module binds the real one
import { FOG, click, host, installSvgPanelHooks, mount, q, settle, unmountPanel } from "./helpers/svgpanel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePairMeta } from "../src/lib/pairmeta";
import { styleRowId } from "../src/lib/svgstyles";
import { baseFaceOf, rebuiltRow, resetStylePrefs } from "../src/svg/styles";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";

installSvgPanelHooks();
beforeEach(() => {
  resetStylePrefs();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
});

const STYLE = "colored_wiggle";
const SID = styleRowId(FOG, STYLE);
/** the style image carries a version, like real regenerated style art does */
const MAIN = `fog_AI_v2_${STYLE}.png`;

const png = (name: string, seed: string) => new FakeFile(name, 20, 3100, seed);

/** Approved fog row + a `_colored_wiggle` folder: versioned main + 2 variants. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(MAIN, png(MAIN, "s"));
  style.children.set(`fog_AI_v2_${STYLE}_01.png`, png(`fog_AI_v2_${STYLE}_01.png`, "s1"));
  style.children.set(`fog_AI_v2_${STYLE}_02.png`, png(`fog_AI_v2_${STYLE}_02.png`, "s2"));
  arch.children.set(`_${STYLE}`, style);
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

const slots = () => [...host.querySelectorAll(".svg-pair-with-bar .pair-thumbs > .pair-thumb")] as HTMLElement[];
const baseSlot = () => q(`[data-testid="svg-base-ai-${SID}"]`);

function styleMeta(root: FakeDir) {
  const style = (root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir;
  const side = style.children.get(`fog_AI_v2_${STYLE}.svg.json`) as FakeFile;
  const parsed = parsePairMeta(side.text);
  if (!parsed.ok) throw new Error("the style pair file no longer parses");
  return parsed.meta;
}

/** Mount, check the row, register its styles, switch to it. */
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

describe("a registered style survives a restart without re-registering", () => {
  it("the restart scan finds the style pair file under its versioned name", async () => {
    const root = await mountStyleRow();
    expect(q(`[data-testid="svg-row-${SID}"]`)).not.toBeNull();
    expect(styleMeta(root).imageVersions.map((v) => v.version)).toEqual([1, 2]);
    // a restart: new panel, empty in-memory metas, the same folder and prefs
    await unmountPanel();
    await mount(root);
    await settle();
    await settle();
    expect(q(`[data-testid="svg-row-${SID}"]`)).not.toBeNull(); // no re-registration
    expect(baseSlot()).not.toBeNull(); // three previews, base face included
    expect(q(`[data-testid="svg-ai-chip-${SID}-1"]`)).not.toBeNull();
  });
});

describe("removing a style variant keeps the Base · Stroke preview", () => {
  it("🗑 on a variant drops that version only — the base face stays, and Undo restores it", async () => {
    const root = await mountStyleRow();
    expect(slots()).toHaveLength(3);
    // one 🗑 for the whole preview, in its corner — never one beside every chip
    expect(document.querySelectorAll(".svg-chip-with-trash")).toHaveLength(0);
    const corner = q(`[data-testid="svg-ai-trash-${SID}"]`);
    expect(corner).not.toBeNull();
    expect(q(`[data-testid="svg-ai-${SID}"]`)?.contains(corner as Node)).toBe(true);
    // the corner can removes the version the preview shows — so show v2 first
    await click(q(`[data-testid="svg-ai-chip-${SID}-2"]`)!);
    await settle();
    await click(q(`[data-testid="svg-ai-trash-${SID}"]`)!);
    await settle();
    expect(styleMeta(root).imageVersions.map((v) => v.version)).toEqual([1]);
    expect(q(`[data-testid="svg-row-${SID}"]`)).not.toBeNull();
    expect(baseSlot()).not.toBeNull(); // the bug: this went missing
    expect(slots()).toHaveLength(3);
    await click(q("[data-testid=hist-undo]")!);
    await settle();
    expect(styleMeta(root).imageVersions.map((v) => v.version)).toEqual([1, 2]);
    expect(baseSlot()).not.toBeNull();
    expect(slots()).toHaveLength(3);
  });

  it("the corner 🗑 rests while the original is the main image — it removes versions, not the original", async () => {
    await mountStyleRow();
    await click(q(`[data-testid="svg-ai-chip-${SID}-orig"]`)!);
    await settle();
    expect(q(`[data-testid="svg-ai-trash-${SID}"]`)).toBeNull();
  });
});

describe("styles.rebuiltRow — the one owner of the style face on rebuilds", () => {
  const metaOf = (base: ReturnType<typeof pairFile> | null) => (id: string) => (id === FOG ? base : null);
  const styleRow = (face?: string) => ({ source: { id: SID, relPath: `architecture/_${STYLE}/${MAIN}` }, baseAiPath: face } as unknown as SvgRow);

  it("re-attaches the base face from the base pair file", () => {
    const base = pairFile("architecture", "fog_AI.png");
    const next = rebuiltRow(styleRow(), null, false, metaOf(base));
    expect(next.baseAiPath).toBe("architecture/fog_AI.png");
  });

  it("keeps the row's previous face when the base pair file is not in hand", () => {
    const next = rebuiltRow(styleRow("architecture/fog_AI.png"), null, false, metaOf(null));
    expect(next.baseAiPath).toBe("architecture/fog_AI.png");
  });

  it("leaves base rows untouched", () => {
    const base = pairFile("architecture", "fog_AI.png");
    const row = { source: { id: FOG, relPath: "architecture/fog_AI.png" } } as unknown as SvgRow;
    expect(rebuiltRow(row, null, false, metaOf(base)).baseAiPath).toBeUndefined();
    expect(baseFaceOf(FOG, metaOf(base))).toBeUndefined();
  });
});
