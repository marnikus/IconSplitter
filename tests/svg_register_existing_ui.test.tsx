// svg_register_existing_ui.test.tsx — the "Register existing SVGs" button of the
// Generate SVG tab (user request 2026-11-01): a folder whose SVGs the app did not
// write still gets them into the pair's history, one file or several, with the
// newest made the shown version — and the row thereafter behaves like a generated
// one. Also pins the honest edges: an invalid file is not recorded, a second click
// adds nothing, a busy pair is refused.
import { act } from "react";
import { describe, expect, it } from "vitest";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { runRegisterFor } from "../src/svg/registerexisting";
import { toRow } from "../src/svg/rowmodel";
import { svgSource, pairMetaFor, svgVersion } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { FOG, click, input, installSvgPanelHooks, makeRoot, mount, q, settle, text, unmountPanel } from "./helpers/svgpanel";
import { reserveSources, SOURCE_BUSY } from "../src/svg/jobstate";
import { armCompletionSound } from "../src/ui/completionSound";
import { clearCompletionAudio, completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";

installSvgPanelHooks();

const doc = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;
const V1 = doc("#c22f2f");
const V2 = doc("#2f6dc2");

/** architecture/fog with an AI image and SVGs on disk the pair file never recorded. */
function rootWith(files: Record<string, string>, versions: Parameters<typeof pairMetaFor>[1] = []): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  for (const [name, body] of Object.entries(files)) arch.children.set(name, new FakeFile(name, body.length, 3200, body));
  const source = svgSource(FOG, { name: "fog_AI.png" });
  const meta = pairMetaFor(source, versions);
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3300, serializePairMeta(meta)));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

function pairFileOnDisk(root: FakeDir) {
  const file = (root.children.get("architecture") as FakeDir).children.get("fog_AI.svg.json") as FakeFile;
  const parsed = parsePairMeta(file.text);
  if (!parsed.ok) throw new Error("the pair file no longer parses");
  return parsed.meta;
}

/** The mutable refs a real panel carries — leases and the queue live on them. */
function refsFor(root: FakeDir) {
  return {
    root: { current: root }, metas: new Map(), abort: { current: null },
    queue: { current: [] }, key: { current: null },
  } as never;
}

/** A context as the panel builds it, with the two writers the action uses. */
function ctxFor(root: FakeDir, versions: Parameters<typeof pairMetaFor>[1] = []) {
  const source = svgSource(FOG, { name: "fog_AI.png" });
  const row = toRow(source, pairMetaFor(source, versions), false);
  const said: { msg: string; err: boolean }[] = [];
  const ctx = {
    refs: refsFor(root),
    rows: [row],
    say: (msg: string, err = false) => { said.push({ msg, err }); },
    setRowsFn: (fn: (rows: typeof row[]) => typeof row[]) => { ctx.rows = fn(ctx.rows); },
  };
  return { ctx, source, said };
}

describe("one SVG already in the folder", () => {
  it("is recorded as v1 — the row becomes generated and shows it", async () => {
    const root = rootWith({ "fog_AI.svg": V1 });
    const { ctx, said } = ctxFor(root);
    await runRegisterFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.versions.map((v) => [v.version, v.svgPath, v.status, v.provider])).toEqual([
      [1, "architecture/fog_AI.svg", "generated", "existing file"],
    ]);
    expect(meta.preferred).toBe(1);
    expect(ctx.rows[0].status).toBe("generated");
    expect(ctx.rows[0].newest?.version).toBe(1);
    expect(said.at(-1)).toEqual({ msg: "1 existing SVG registered — v1 is now shown", err: false });
  });
});

describe("several SVGs already in the folder", () => {
  it("records each by its name and makes the newest the shown version", async () => {
    const root = rootWith({ "fog_AI.svg": V1, "fog_AI_v2.svg": V2 });
    const { ctx, said } = ctxFor(root);
    await runRegisterFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(meta.preferred).toBe(2);
    expect(meta.review).toBe("pending"); // registered, not silently approved
    expect(ctx.rows[0].preferred?.version).toBe(2);
    expect(said.at(-1)?.msg).toBe("2 existing SVGs registered — v2 is now shown");
  });

  it("keeps an approval the pair already had", async () => {
    const source = svgSource(FOG, { name: "fog_AI.png" });
    const approved = [svgVersion("architecture/fog_AI.svg", { version: 1, review: "approved" })];
    const root = rootWith({ "fog_AI_v2.svg": V2 }, approved);
    const { ctx } = ctxFor(root, approved);
    ctx.rows = [toRow(source, pairMetaFor(source, approved, "approved"), false)];
    await runRegisterFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.review).toBe("approved");
    expect(meta.versions.map((v) => v.review)).toEqual(["approved", "approved"]);
    expect(meta.preferred).toBe(2);
  });
});

describe("the folder from the report (split pair, pre-split SVG name)", () => {
  /** .../download-icon-01_AI/split_01/download-icon-01_AI_01.png + an older-named SVG beside it. */
  function splitRoot(svgName: string): FakeDir {
    const root = new FakeDir("split_root");
    const dir = new FakeDir("split_01");
    dir.children.set("download-icon-01.png", new FakeFile("download-icon-01.png", 12, 3000, "a"));
    dir.children.set("download-icon-01_AI_01.png", new FakeFile("download-icon-01_AI_01.png", 20, 3100, "b"));
    dir.children.set(svgName, new FakeFile(svgName, V1.length, 3200, V1));
    root.children.set("split_01", dir);
    const recs = [{
      pair_id: SPLIT_ID, source: "split_01/download-icon-01.png",
      ai_result: "split_01/download-icon-01_AI_01.png", decision: "approved", reviewed_at: "2026-11-01T09:00:00.000Z",
    }];
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
    return root;
  }

  const SPLIT_ID = pairId("split_01", "download-icon-01", "_01");

  function splitMetaOnDisk(root: FakeDir) {
    const file = (root.children.get("split_01") as FakeDir).children.get("download-icon-01_AI_01.svg.json") as FakeFile;
    const parsed = parsePairMeta(file.text);
    if (!parsed.ok) throw new Error("the pair file was not written");
    return parsed.meta;
  }

  it("registers download-icon-01_AI.svg for download-icon-01_AI_01.png and writes the pair file", async () => {
    const root = splitRoot("download-icon-01_AI.svg");
    await mount(root);
    await act(async () => input(`[data-testid=svg-check-${SPLIT_ID}]`).click());
    await settle();
    await click(q("[data-testid=svg-register-existing]") as HTMLElement);
    await settle();
    const meta = splitMetaOnDisk(root);
    expect(meta.versions.map((v) => [v.version, v.svgPath])).toEqual([
      [1, "split_01/download-icon-01_AI.svg"],
    ]);
    expect(meta.preferred).toBe(1);
    expect(meta.review).toBe("pending");
    expect(text("[data-testid=svg-toast]")).toBe("1 existing SVG registered — v1 is now shown");
    expect(text("[data-testid=svg-status-progress]")).toBe("1 / 1 generated");
    await unmountPanel();
  });

  it("says what it saw when the folder holds another pair's artwork instead", async () => {
    const root = splitRoot("court_AI.svg");
    await mount(root);
    await act(async () => input(`[data-testid=svg-check-${SPLIT_ID}]`).click());
    await settle();
    await click(q("[data-testid=svg-register-existing]") as HTMLElement);
    await settle();
    expect(text("[data-testid=svg-toast]")).toBe(
      "No existing SVG for download-icon-01_AI_01 in 1 selected folder — 1 other SVG there is not this pair's (e.g. court_AI.svg)",
    );
    await unmountPanel();
  });
});

describe("the pass is visible while it runs", () => {
  it("reports through the same progress bar stack and sounds once when it ends", async () => {
    recordCompletionAudio();
    armCompletionSound();
    const root = rootWith({ "fog_AI.svg": V1, "fog_AI_v2.svg": V2 });
    await mount(root);
    await act(async () => input(`[data-testid=svg-check-${FOG}]`).click());
    await settle();
    clearCompletionAudio(); // the panel's own scan already cued; count the pass only
    await click(q("[data-testid=svg-register-existing]") as HTMLElement);
    await settle();
    expect(q("[data-testid=register-svg-progress-header]")).not.toBeNull();
    expect(text("[data-testid=register-svg-progress-title]")).toBe("Registering existing SVGs complete");
    expect(text("[data-testid=register-svg-progress-percent]")).toBe("100%");
    expect(text("[data-testid=register-svg-progress-completed]")).toBe("1 completed / 1");
    expect(q("[data-testid=register-svg-progress-track]")?.getAttribute("aria-valuenow")).toBe("100");
    expect(q("[data-testid=register-svg-progress-header]")?.className).toContain("complete");
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
    await unmountPanel();
  });
});

describe("the honest edges", () => {
  it("never records a file that does not validate, and says what it skipped", async () => {
    const root = rootWith({ "fog_AI.svg": V1, "fog_AI_v2.svg": "<svg><broken>" });
    const { ctx, said } = ctxFor(root);
    await runRegisterFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.versions.map((v) => v.version)).toEqual([1]);
    expect(meta.preferred).toBe(1);
    expect(said.at(-1)?.msg).toBe("1 existing SVG registered — v1 is now shown · 1 skipped (not a valid SVG)");
  });

  it("adds nothing the second time, and does not call an empty folder an error", async () => {
    const root = rootWith({ "fog_AI.svg": V1 });
    const first = ctxFor(root);
    await runRegisterFor(first.ctx as never, [FOG]);
    const root2 = rootWith({});
    const second = ctxFor(root2);
    await runRegisterFor(second.ctx as never, [FOG]);
    expect(second.said.at(-1)).toEqual({ msg: "No existing SVG for fog_AI in 1 selected folder", err: false });
    // the pair file on disk now records v1, so a rescan-based run adds nothing
    const { ctx } = ctxFor(root);
    ctx.rows = [toRow(svgSource(FOG, { name: "fog_AI.png" }), pairFileOnDisk(root), false)];
    await runRegisterFor(ctx as never, [FOG]);
    expect(pairFileOnDisk(root).versions).toHaveLength(1);
  });

  it("refuses a pair another process holds, changing nothing", async () => {
    const root = rootWith({ "fog_AI.svg": V1 });
    const { ctx, said } = ctxFor(root);
    const held = reserveSources(ctx as never, [FOG]);
    expect(held).not.toBeNull(); // the panel holds this pair while it uploads/edits
    try {
      await runRegisterFor(ctx as never, [FOG]);
    } finally {
      held?.();
    }
    expect(said.at(-1)).toEqual({ msg: SOURCE_BUSY, err: true });
    expect(pairFileOnDisk(root).versions).toEqual([]);
  });
});

describe("the button in the tab", () => {
  it("is disabled with nothing selected and registers the selected folders on a click", async () => {
    await mount(await makeRoot());
    const button = q("[data-testid=svg-register-existing]") as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true); // nothing selected yet
    await act(async () => input(`[data-testid=svg-check-${FOG}]`).click());
    await settle();
    expect((q("[data-testid=svg-register-existing]") as HTMLButtonElement).disabled).toBe(false);
    await click(q("[data-testid=svg-register-existing]") as HTMLElement);
    await settle();
    // fog's v1 is already in its pair file: nothing new is invented
    expect(text("[data-testid=svg-toast]")).toBe("No existing SVG for fog_AI in 1 selected folder");
    expect(q(`[data-testid=svg-prev-${FOG}]`)).not.toBeNull();
  });

  it("registers a folder's SVG from a real click and shows the newest version", async () => {
    const root = rootWith({ "fog_AI.svg": V1, "fog_AI_v2.svg": V2 });
    await mount(root);
    await act(async () => input(`[data-testid=svg-check-${FOG}]`).click());
    await settle();
    await click(q("[data-testid=svg-register-existing]") as HTMLElement);
    await settle();
    expect(pairFileOnDisk(root).versions.map((v) => v.version)).toEqual([1, 2]);
    expect(q(`[data-testid=svg-ver-chip-${FOG}-2]`)?.getAttribute("data-active")).toBe("true");
    expect(text("[data-testid=svg-status-progress]")).toBe("1 / 1 generated");
    expect(pairId("architecture", "fog", "")).toBe(FOG);
    await unmountPanel();
  });
});
