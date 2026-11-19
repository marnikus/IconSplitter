// @vitest-environment happy-dom
// svg_review_before_svg.test.tsx — the item review BEFORE any SVG exists
// (2026-11-17): an AI image concept can be declined (or reset to no decision)
// before a vector is drawn — row ✕ / ↺, the bulk bar's Decline selected and
// the `d` hotkey all work on a row with no generated version. Approve,
// needs-review and the regen marks judge an SVG and stay gated. A
// pre-generation decline lands in the pair file like any decision while the
// Selection decision (and the row's place in the list) stays untouched.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COURT, FOG, installSvgPanelHooks, makeRoot, mount, q, settle, text, unmountPanel,
} from "./helpers/svgpanel";
import { useSvgHotkeys, type SvgHotActions } from "../src/svg/SvgHotkeys";
import { toRow } from "../src/svg/rowmodel";
import { applyReviewPatch, decideReview, type ReviewCtx } from "../src/svg/reviewact";
import type { SvgReviewPatch } from "../src/svg/reviewundo";
import { saveMetaAt } from "../src/selection/pairstore";
import { sideOf, type PairMeta } from "../src/lib/pairmeta";
import { styleRowId } from "../src/lib/svgstyles";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { pairMetaFor, svgSource, svgVersion } from "./helpers/svgpair";
import type { FakeDir } from "./helpers/fakefs";

installSvgPanelHooks();

const off = (sel: string) => (q(sel) as HTMLButtonElement).disabled;
const click = async (sel: string) => { await act(async () => { (q(sel) as HTMLElement).click(); }); };

async function courtMeta(root: FakeDir): Promise<Record<string, unknown>> {
  const dir = await root.getDirectoryHandle("architecture");
  const file = await dir.getFileHandle("court_AI.svg.json");
  return JSON.parse(await (await file.getFile()).text()) as Record<string, unknown>;
}

afterEach(() => unmountPanel());

describe("review before an SVG exists — row and bulk bar", () => {
  it("✕ and ↺ work with no generated SVG; ✓ ⚠ ⧉ △ stay gated; the decline lands in the pair file", async () => {
    const root = await makeRoot();
    await mount(root);
    expect(off(`[data-testid=svg-decline-${COURT}]`)).toBe(false); // the concept can be declined now
    expect(off(`[data-testid=svg-review-reset-${COURT}]`)).toBe(false);
    expect(off(`[data-testid=svg-approve-${COURT}]`)).toBe(true); // approving needs an SVG
    expect(off(`[data-testid=svg-needs-review-${COURT}]`)).toBe(true);
    expect(off(`[data-testid=svg-regen-overlaps-${COURT}]`)).toBe(true);
    expect(off(`[data-testid=svg-regen-geometry-${COURT}]`)).toBe(true);
    await click(`[data-testid=svg-decline-${COURT}]`);
    await settle();
    expect(text(`[data-testid=svg-review-${COURT}]`)).toBe("Declined");
    expect(text("[data-testid=svg-toast]")).toContain("1 item marked declined");
    expect(q(`[data-testid=svg-row-${COURT}]`)).not.toBeNull(); // the row keeps its place…
    expect(await courtMeta(root)).toMatchObject({ review: "declined" }); // …in its own pair file
    // reset back to no decision, without Undo
    await click(`[data-testid=svg-review-reset-${COURT}]`);
    await settle();
    expect(text(`[data-testid=svg-review-${COURT}]`)).toBe("Pending");
    expect(text("[data-testid=svg-toast]")).toContain("1 item reset to no decision");
    expect(await courtMeta(root)).toMatchObject({ review: "pending" });
    // a row WITH an SVG still speaks of SVGs
    await click(`[data-testid=svg-decline-${FOG}]`);
    await settle();
    expect(text("[data-testid=svg-toast]")).toContain("1 SVG marked declined");
  });

  it("bulk: Decline selected counts checked rows without an SVG; Approve selected does not", async () => {
    await mount(await makeRoot());
    await act(async () => { (q(`[data-testid=svg-check-${COURT}]`) as HTMLInputElement).click(); });
    await settle();
    expect(off("[data-testid=svg-decline-selected]")).toBe(false);
    expect(off("[data-testid=svg-approve-selected]")).toBe(true);
    await click("[data-testid=svg-decline-selected]");
    await settle();
    expect(text(`[data-testid=svg-review-${COURT}]`)).toBe("Declined");
  });
});

describe("review before an SVG exists — hotkeys", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  function Keys({ rows, active, decide }: { rows: SvgRow[]; active: string; decide: SvgHotActions["decide"] }) {
    const noop = () => undefined;
    const a: SvgHotActions = { visible: rows, activeId: active, dialogOpen: false, setActive: noop, toggleCheck: noop, generate: noop, decide, showCode: noop, dismissDialog: noop };
    useSvgHotkeys(a, true);
    return <button type="button" data-testid="btn">a button</button>;
  }
  const rowWithoutSvg = (id: string): SvgRow => toRow(svgSource(id, { dir: "a", name: `${id}_AI.png` }), null, false);
  const key = (k: string) => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });

  it("d declines the active row with no SVG; a and w stay silent", async () => {
    const decide = vi.fn();
    await act(async () => { ui.render(<Keys rows={[rowWithoutSvg("r1")]} active="r1" decide={decide} />); });
    await key("d");
    expect(decide).toHaveBeenCalledWith(["r1"], "declined");
    decide.mockClear();
    await key("a");
    await key("w");
    expect(decide).not.toHaveBeenCalled();
  });
});

describe("review before an SVG exists — the write path", () => {
  const STYLE = "v4";
  function ctxFor(rows: SvgRow[], root: FakeDir | null, metas: Map<string, PairMeta>, said: string[]) {
    const pushed: Array<{ label: string; before: unknown; after: unknown }> = [];
    const refs = { root: { current: root }, metas, queue: { current: [] } } as unknown as SvgRefs;
    return {
      rows, refs, said, pushed,
      setRowsFn: (fn: (all: SvgRow[]) => SvgRow[]) => { rows.splice(0, rows.length, ...fn(rows)); },
      say: (m: string) => said.push(m),
      hist: { push: (e: { label: string; before: unknown; after: unknown }) => pushed.push(e) },
    } as unknown as ReviewCtx & { pushed: Array<{ label: string; before: unknown; after: unknown }> };
  }

  it("a style row with no SVG declines into its OWN pair file; the base file keeps its review; undo restores it", async () => {
    const { FakeDir: Dir, FakeFile } = await import("./helpers/fakefs");
    const root = new Dir("root");
    const dir = new Dir("a");
    dir.children.set("a_AI.png", new FakeFile("a_AI.png", 20, 2100, "a"));
    const style = new Dir(`_${STYLE}`);
    style.children.set(`a_AI_${STYLE}.png`, new FakeFile(`a_AI_${STYLE}.png`, 30, 2100, "s"));
    dir.children.set(`_${STYLE}`, style);
    root.children.set("a", dir);
    const baseId = "pair-base";
    const baseSource = svgSource(baseId, { dir: "a", name: "a_AI.png" });
    const baseMeta: PairMeta = { ...pairMetaFor(baseSource, []), review: "pending" };
    const sid = styleRowId(baseId, STYLE);
    const styleSource = { ...baseSource, id: sid, relPath: `a/_${STYLE}/a_AI_${STYLE}.png`, metaPath: `a/_${STYLE}/a_AI_${STYLE}.svg.json` };
    const styleMeta: PairMeta = { ...baseMeta, id: sid, ai: sideOf(`a/_${STYLE}/a_AI_${STYLE}.png`, "30:2100"), review: "pending" };
    await saveMetaAt(root, baseSource.metaPath, baseMeta);
    await saveMetaAt(root, styleSource.metaPath, styleMeta);
    const rows = [toRow(styleSource, styleMeta, false)];
    const said: string[] = [];
    const c = ctxFor(rows, root, new Map([[sid, styleMeta], [baseId, baseMeta]]), said);
    await decideReview(c, [sid], "declined");
    expect(rows[0].review).toBe("declined");
    const styleDir = await (await root.getDirectoryHandle("a")).getDirectoryHandle(`_${STYLE}`);
    const styleHandle = await styleDir.getFileHandle(`a_AI_${STYLE}.svg.json`);
    const styleFile = JSON.parse(await (await styleHandle.getFile()).text()) as Record<string, unknown>;
    expect(styleFile.review).toBe("declined"); // the concept is declined where the style pair lives
    const baseHandle = await (await root.getDirectoryHandle("a")).getFileHandle("a_AI.svg.json");
    const baseFile = JSON.parse(await (await baseHandle.getFile()).text()) as Record<string, unknown>;
    expect(baseFile.review).toBe("pending"); // the base row is untouched
    expect(said.some((m) => m.includes("1 item marked declined"))).toBe(true);
    expect(c.pushed[0].label).toBe("Decline 1 item");
    // Undo brings the style pair back to pending without needing a generated SVG
    expect(await applyReviewPatch(c, c.pushed[0].before as SvgReviewPatch)).toBe(true);
    expect(rows[0].review).toBe("pending");
    const restored = JSON.parse(await (await (await styleDir.getFileHandle(`a_AI_${STYLE}.svg.json`)).getFile()).text()) as Record<string, unknown>;
    expect(restored.review).toBe("pending");
  });

  it("approve with no generated SVG is still refused", async () => {
    const rows = [toRow(svgSource("pair-x", { dir: "a", name: "a_AI.png" }), null, false)];
    const said: string[] = [];
    const c = ctxFor(rows, null, new Map(), said);
    await decideReview(c, ["pair-x"], "approved");
    expect(said).toEqual(["No generated SVG to review yet"]);
    expect(rows[0].review).toBe("pending");
  });

  it("a row WITH an SVG still declines, and its history verb names the SVG", async () => {
    const source = svgSource("pair-y", { dir: "a", name: "a_AI.png" });
    const meta = pairMetaFor(source, [svgVersion("a/a_AI.svg")]);
    const rows = [toRow(source, meta, false)];
    const said: string[] = [];
    const pushed: Array<{ label: string }> = [];
    const refs = { root: { current: null }, metas: new Map([["pair-y", meta]]), queue: { current: [] } } as unknown as SvgRefs;
    const c = {
      rows, refs, setRowsFn: (fn: (all: SvgRow[]) => SvgRow[]) => { rows.splice(0, rows.length, ...fn(rows)); },
      say: (m: string) => said.push(m), hist: { push: (e: { label: string }) => pushed.push(e) },
    } as unknown as ReviewCtx;
    await decideReview(c, ["pair-y"], "declined");
    expect(rows[0].review).toBe("declined");
    expect(said).toEqual(["1 SVG marked declined"]);
    expect(pushed[0].label).toBe("Decline 1 SVG");
  });
});
