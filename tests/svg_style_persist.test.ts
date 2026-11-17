// svg_style_persist.test.ts — a registered image style survives a restart
// (user report 2026-11-17: after restarting the app every style image had to be
// registered again before it showed, although its pair file was on disk). The
// registration IS the style's own pair file inside the `_<style>` folder, so a
// fresh session must find it from the walk alone — never from a remembered list
// of names, and never from re-registering.
import { beforeEach, describe, expect, it } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { styleFileIdentityOf, styleRowId } from "../src/lib/svgstyles";
import { registerStyles, resetStylePrefs, stylePrefs, switchStyle, STYLES_KEY } from "../src/svg/styles";
import { scanSources } from "../src/svg/scan";
import { toRow } from "../src/svg/rowmodel";
import type { Discovery } from "../src/svg/sources";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { setAppState } from "../src/state/appstore";
import { pairMetaFor, svgSource } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

const FOG = pairId("architecture", "fog", "");
const STYLE = "colored_wiggle";
const STYLE_ROW = styleRowId(FOG, STYLE);
const STYLE_DIR = `architecture/_${STYLE}`;
const STYLE_FILES = ["fog_AI_colored_wiggle.png", "fog_AI_colored_wiggle_01.png",
  "fog_AI_colored_wiggle_02.png", "fog_AI_colored_wiggle_03.png"];

/** architecture/fog approved, with a `_colored_wiggle` folder holding 3 variants. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3100,
    serializePairMeta(pairMetaFor(svgSource(FOG, { name: "fog_AI.png" })))));
  const style = new FakeDir(`_${STYLE}`);
  for (const name of STYLE_FILES) style.children.set(name, new FakeFile(name, 20, 4100, "s"));
  arch.children.set(`_${STYLE}`, style);
  root.children.set("architecture", arch);
  return root;
}

/** Fresh refs/setters, exactly what a reloaded tab starts with (no metas in memory). */
function session(root: FakeDir) {
  const out = { rows: [] as SvgRow[], discovery: null as Discovery | null, said: [] as string[] };
  const refs: SvgRefs = {
    root: { current: root }, metas: new Map(), abort: { current: null }, queue: { current: [] },
    key: { current: null }, scanKey: { current: null }, seq: { current: SCAN_IDLE },
  };
  const setters = {
    setRootName: () => undefined,
    setRows: (rows: SvgRow[]) => { out.rows = rows; },
    setDiscovery: (d: Discovery | null) => { out.discovery = d; },
    setBusy: () => undefined,
    setRootToken: () => undefined,
    say: (m: string) => { out.said.push(m); },
  };
  return { refs, setters, out };
}

/** What "◐ Register styles" does to this root, in the first session. */
async function register(root: FakeDir): Promise<void> {
  const { refs, setters, out } = session(root);
  await scanSources(refs, setters);
  const ctx = {
    refs, discovery: out.discovery, rows: out.rows,
    say: (m: string) => out.said.push(m),
    setRows: (rows: SvgRow[]) => { out.rows = rows; },
  };
  await registerStyles(ctx, [FOG]);
  expect(stylePrefs().styles).toEqual([STYLE]);
}

beforeEach(async () => {
  await dropDb();
  setAppState({});
  window.localStorage.clear();
  resetStylePrefs();
});

describe("the style's pair file is the registration", () => {
  it("a style pair file names its own row: `<base>/_<style>/<base stem>[_vN]_<style>.svg.json`", () => {
    const main = styleFileIdentityOf(`${STYLE_DIR}/fog_AI_colored_wiggle.svg.json`);
    expect(main).toEqual({ style: STYLE, baseDir: "architecture", baseRowId: FOG, id: STYLE_ROW });
    // the style image may carry the row's own image version (`_v2`) — the id is the same
    expect(styleFileIdentityOf(`${STYLE_DIR}/fog_AI_v2_colored_wiggle.svg.json`)?.id).toBe(STYLE_ROW);
    // anything that is not a style file answers null, never a guess
    expect(styleFileIdentityOf("architecture/fog_AI.svg.json")).toBeNull();
    expect(styleFileIdentityOf(`${STYLE_DIR}/other-icon_colored_wiggle.svg.json`)).toBeNull();
    expect(styleFileIdentityOf(`${STYLE_DIR}/fog_AI_colored_wiggle.svg`)).toBeNull();
    // a variant's own name is not the style's record: only the style image names it
    expect(styleFileIdentityOf(`${STYLE_DIR}/fog_AI_colored_wiggle_01.svg.json`)).toBeNull();
    // the base stem carries the AI suffix (`_AI_03`), which the base row id must keep
    const suffix = styleFileIdentityOf("a/b/_soft/fog_AI_03_soft.svg.json");
    expect(suffix?.baseRowId).toBe(pairId("a/b", "fog", "_03"));
    expect(suffix?.id).toBe(styleRowId(pairId("a/b", "fog", "_03"), "soft"));
  });

  it("after a restart the style row shows again — its variants, its artwork, its comparison side", async () => {
    const root = makeRoot();
    await register(root);
    // the pair file really is on disk, inside the style folder
    const styleDir = (root.children.get("architecture") as FakeDir).children.get(`_${STYLE}`) as FakeDir;
    expect(styleDir.children.has("fog_AI_colored_wiggle.svg.json")).toBe(true);

    const { refs, setters, out } = session(root); // ← the restart: nothing in memory
    await scanSources(refs, setters);
    // the bar knows the style again, from the file — no second registration
    expect(stylePrefs()).toEqual({ styles: [STYLE], active: null });
    // and picking it is all it takes for the style row to come back whole
    switchStyle({ refs, discovery: out.discovery, rows: out.rows, say: () => undefined,
      setRows: (r: SvgRow[]) => { out.rows = r; } }, STYLE);
    expect(out.rows).toHaveLength(1);
    const row = out.rows[0];
    expect(row.source.id).toBe(STYLE_ROW);
    expect(row.source.dirPath).toBe(STYLE_DIR);
    expect(row.source.stem).toBe("fog_AI_colored_wiggle");
    expect(row.meta?.imageVersions.map((v) => v.version)).toEqual([1, 2, 3]);
    // the previews read these files, so every recorded path must still resolve
    expect(row.meta?.imageVersions.map((v) => v.file)).toEqual(
      [1, 2, 3].map((n) => `${STYLE_DIR}/fog_AI_colored_wiggle_0${n}.png`),
    );
    // the Base · Stroke side: the base row's own approved artwork, side by side
    expect(row.baseAiPath).toBe("architecture/fog_AI.png");
  });

  it("stays the row the style bar is on: the picked style is restored too", async () => {
    const root = makeRoot();
    await register(root);
    const first = session(root);
    await scanSources(first.refs, first.setters);
    const ctx = { refs: first.refs, discovery: first.out.discovery, rows: first.out.rows, say: () => undefined,
      setRows: (r: SvgRow[]) => { first.out.rows = r; } };
    switchStyle(ctx, STYLE);
    expect(stylePrefs().active).toBe(STYLE);

    const { refs, setters, out } = session(root);
    await scanSources(refs, setters);
    expect(out.rows[0].source.id).toBe(STYLE_ROW);
  });

  it("a lost style list is rebuilt from the folders, so a cleared browser cache loses no registration", async () => {
    const root = makeRoot();
    await register(root);
    window.localStorage.removeItem(STYLES_KEY);
    resetStylePrefs();
    expect(stylePrefs().styles).toEqual([]);

    const { refs, setters, out } = session(root);
    await scanSources(refs, setters);
    expect(stylePrefs().styles).toEqual([STYLE]);
    switchStyle({ refs, discovery: out.discovery, rows: out.rows, say: () => undefined,
      setRows: (r: SvgRow[]) => { out.rows = r; } }, STYLE);
    expect(out.rows[0].source.id).toBe(STYLE_ROW);
    expect(out.rows[0].meta?.imageVersions).toHaveLength(3);
  });

  it("follows the folder between roots: picking the pair's own folder still resolves every variant", async () => {
    const root = makeRoot();
    await register(root); // written while the parent folder was picked
    const inner = (root.children.get("architecture") as FakeDir); // …and now that folder is picked itself
    const { refs, setters, out } = session(inner);
    await scanSources(refs, setters);
    expect(stylePrefs().styles).toEqual([STYLE]);
    switchStyle({ refs, discovery: out.discovery, rows: out.rows, say: () => undefined,
      setRows: (r: SvgRow[]) => { out.rows = r; } }, STYLE);
    const row = out.rows[0];
    expect(row.source.id).toBe(styleRowId(pairId("", "fog", ""), STYLE));
    expect(row.source.dirPath).toBe(`_${STYLE}`);
    expect(row.meta?.imageVersions.map((v) => v.file)).toEqual(
      [1, 2, 3].map((n) => `_${STYLE}/fog_AI_colored_wiggle_0${n}.png`),
    );
    expect(row.baseAiPath).toBe("fog_AI.png");
  });

  it("the base style still lists the base row: a style file never becomes a row of its own", async () => {
    const root = makeRoot();
    await register(root);
    const { refs, setters, out } = session(root);
    await scanSources(refs, setters);
    expect(out.discovery?.sources.map((s) => s.id)).toEqual([FOG]);
    // and switching back shows the base row with no comparison side
    expect(toRow(out.discovery!.sources[0], out.discovery!.metas.get(FOG) ?? null, false).baseAiPath).toBeUndefined();
  });
});
