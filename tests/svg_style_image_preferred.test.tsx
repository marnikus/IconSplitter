// svg_style_image_preferred.test.tsx — style-mode AI source version selection
// (`imagePreferred` in `_<style>/<stem>.svg.json`) persists across style
// switches, restarts, review actions, rescans, Get data, and SVG generation so
// this app and external tools always know which AI source variant is selected.
// first: this helper installs the in-memory folder store before any app module binds the real one
import { FOG, click, installSvgPanelHooks, mount, q, settle, unmountPanel } from "./helpers/svgpanel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { compositeLayout } from "../src/lib/svgcomposite";
import { styleRowId } from "../src/lib/svgstyles";
import { svgDataRows } from "../src/svg/getdatarows";
import { saveApiKey } from "../src/svg/keystore";
import { toRow } from "../src/svg/rowmodel";
import { scanKey } from "../src/svg/scankey";
import type { Discovery } from "../src/svg/sources";
import { resetStylePrefs } from "../src/svg/styles";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { waitUntil } from "./helpers/quiet";
import { transport, type Transport } from "./helpers/svgtransport";

const sheets: string[][] = [];
vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly { relPath: string }[], imageOf?: (s: { relPath: string }) => string) => {
      sheets.push(sources.map((s) => (imageOf ? imageOf(s) : s.relPath)));
      return { dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`, hash: `h${sources.length}`, layout: compositeLayout(sources.length), bytes: 10 };
    }),
  };
});

let svgT: Transport = transport();

installSvgPanelHooks();
beforeEach(async () => {
  resetStylePrefs();
  sheets.length = 0;
  svgT = transport();
  await saveApiKey("rq_test_key");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/chat/completions")) return svgT.fetch(url, init);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }));
});

const STYLE = "colored_wiggle";
const SID = styleRowId(FOG, STYLE);
const V1 = `architecture/_${STYLE}/fog_AI_v2_${STYLE}_01.png`;
const V2 = `architecture/_${STYLE}/fog_AI_v2_${STYLE}_02.png`;

const png = (name: string, seed: string) => new FakeFile(name, 20, 3100, seed);

/** Style folder with ONLY numbered variants (`_01.png`, `_02.png`) and no unnumbered main PNG. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(`fog_AI_v2_${STYLE}_01.png`, png(`fog_AI_v2_${STYLE}_01.png`, "s1"));
  style.children.set(`fog_AI_v2_${STYLE}_02.png`, png(`fog_AI_v2_${STYLE}_02.png`, "s2"));
  arch.children.set(`_${STYLE}`, style);
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

function readStyleMeta(root: FakeDir) {
  const style = (root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir;
  const side = style.children.get(`fog_AI_v2_${STYLE}.svg.json`) as FakeFile;
  const parsed = parsePairMeta(side.text);
  if (!parsed.ok) throw new Error("style pair file failed to parse");
  return parsed.meta;
}

describe("style-mode selected AI source version (imagePreferred) in .svg.json", () => {
  it("keeps imagePreferred across Base -> Style switch and uses it during SVG generation", async () => {
    const root = makeRoot();
    await mount(root);
    await settle();
    await click(q(`[data-testid=svg-check-${FOG}]`)!);
    await click(q("[data-testid=svg-register-styles]")!);
    await settle();
    await settle();
    // switch to colored_wiggle and choose v2
    await click(q("[data-testid=svg-style-select]")!);
    await click(q(`[data-testid=svg-style-opt-${STYLE}]`)!);
    await settle();
    await settle();
    await click(q(`[data-testid="svg-ai-chip-${SID}-2"]`)!);
    await settle();
    expect(readStyleMeta(root).imagePreferred).toBe(2);

    // restart in Base mode (scan runs while active style is null), then switch to colored_wiggle
    await click(q("[data-testid=svg-style-select]")!);
    await click(q("[data-testid=svg-style-opt-base]")!);
    await settle();
    await unmountPanel();
    await saveApiKey("rq_test_key");
    await mount(root);
    await settle();
    await settle();
    await click(q("[data-testid=svg-style-select]")!);
    await click(q(`[data-testid=svg-style-opt-${STYLE}]`)!);
    await settle();
    await settle();
    expect(q(`[data-testid="svg-ai-chip-${SID}-2"]`)?.getAttribute("data-active")).toBe("true");

    // generate SVG for the style row: must vectorize _02.png and preserve imagePreferred: 2 in .svg.json
    await click(q(`[data-testid="svg-generate-${SID}"]`)!);
    await click(q("[data-testid=svg-confirm-generate]")!);
    await waitUntil(() => readStyleMeta(root).versions.length === 1, "SVG version saved", 4000);
    await settle();
    expect(sheets.at(-1)).toEqual([V2]);
    const saved = readStyleMeta(root);
    expect(saved.imagePreferred).toBe(2);
    expect(saved.imageVersions.map((v) => v.version)).toEqual([1, 2]);
    expect(saved.versions).toHaveLength(1);
  });

  it("fills imagePreferred with the active variant when declining a style row whose .svg.json had null", async () => {
    const root = makeRoot();
    await mount(root);
    await settle();
    await click(q(`[data-testid=svg-check-${FOG}]`)!);
    await click(q("[data-testid=svg-register-styles]")!);
    await settle();
    await settle();
    // simulate an external tool writing imagePreferred: null when only numbered variants exist
    const styleDir = (root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir;
    const initial = readStyleMeta(root);
    styleDir.children.set(`fog_AI_v2_${STYLE}.svg.json`, new FakeFile(`fog_AI_v2_${STYLE}.svg.json`, 100, 3200, serializePairMeta({ ...initial, imagePreferred: null })));
    await click(q("[data-testid=svg-style-select]")!);
    await click(q(`[data-testid=svg-style-opt-${STYLE}]`)!);
    await settle();
    await click(q("[data-testid=svg-rescan]")!);
    await settle();
    await settle();
    expect(q(`[data-testid="svg-ai-chip-${SID}-1"]`)?.getAttribute("data-active")).toBe("true");
    await click(q(`[data-testid="svg-decline-${SID}"]`)!);
    await settle();
    const saved = readStyleMeta(root);
    expect(saved.review).toBe("declined");
    expect(saved.imagePreferred).toBe(1);
  });

  it("reports the selected imagePreferred variant in svgDataRows and scanKey", async () => {
    const root = makeRoot();
    await mount(root);
    await settle();
    await click(q(`[data-testid=svg-check-${FOG}]`)!);
    await click(q("[data-testid=svg-register-styles]")!);
    await settle();
    await settle();
    const meta1 = readStyleMeta(root);
    const meta2 = { ...meta1, imagePreferred: 2 };
    const source: Discovery["sources"][number] = {
      id: SID, base: "fog", suffix: "", stem: `fog_AI_v2_${STYLE}`,
      dirPath: `architecture/_${STYLE}`, name: `fog_AI_v2_${STYLE}.png`,
      relPath: `architecture/_${STYLE}/fog_AI_v2_${STYLE}.png`,
      metaPath: `architecture/_${STYLE}/fog_AI_v2_${STYLE}.svg.json`,
      fingerprint: "", sourcePath: null, sourceFingerprint: null, problems: [],
    };
    const row1 = toRow(source, meta1, false);
    const row2 = toRow(source, meta2, false);
    const disc: Discovery = {
      sources: [source], metas: new Map(), problems: [], corruptFiles: [], unreadable: [],
      excluded: [], corruptDecisions: false, fileIndex: new Map(),
      audit: { files: 1, aiSources: 1, references: 0, missing: 0, duplicates: 0, rows: 1 },
    };
    expect(scanKey("split_root", disc, [row1])).not.toBe(scanKey("split_root", disc, [row2]));
    expect(svgDataRows([row1], [SID])[0]?.png?.path).toBe(V1);
    expect(svgDataRows([row2], [SID])[0]?.png?.path).toBe(V2);
  });
});
