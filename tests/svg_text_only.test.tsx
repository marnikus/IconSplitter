// svg_text_only.test.tsx — regenerate WITHOUT the image (2026-11-05). The
// regeneration popup has "Attach the reference image" (on by default); off, a
// request carries only the prompt and the icon's current SVG code: no contact
// sheet is built, the API request has no image part, and the web helper gets
// no image (so ChatGPT's attachment limit does not apply). A first generation
// always sends its image and shows no such box.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatRequest } from "../src/lib/svgrequest";
import { capsFor } from "../src/lib/modelcaps";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { compositeLayout } from "../src/lib/svgcomposite";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import { clearInflight } from "../src/svg/journal";
import { queueItem } from "../src/svg/runqueue";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import SvgBatchStrip from "../src/svg/SvgBatchStrip";
import { createWebTransport } from "../src/svg/runweb";
import type { RegenPlan } from "../src/lib/svgregen";
import type { ConfirmedBatch, RunProgress } from "../src/svg/types";
import type { SvgSource } from "../src/svg/sources";
import { confirmProps } from "./helpers/svgconfirm";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";
import { settle as quietSettle } from "./helpers/quiet";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly SvgSource[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`, hash: "h", layout: compositeLayout(sources.length), bytes: 10,
    })),
  };
});
const { buildComposite } = await import("../src/svg/composite");
const composites = vi.mocked(buildComposite);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the API request", () => {
  it("has no image part when no image is sent", () => {
    const caps = capsFor(DEFAULT_CONFIG.model);
    const params = { temperature: null, maxTokens: 0, effort: null };
    const withImage = buildChatRequest({ model: "m", prompt: "p", image: "data:image/png;base64,AA", caps, params });
    const textOnly = buildChatRequest({ model: "m", prompt: "p", image: null, caps, params });
    expect(withImage.messages[0].content.map((c) => c.type)).toEqual(["text", "image_url"]);
    expect(textOnly.messages[0].content).toEqual([{ type: "text", text: "p" }]);
  });
});

function fixture(): { root: FakeDir; sources: SvgSource[] } {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("icon-1_AI.png", new FakeFile("icon-1_AI.png", 20, 3001, "png"));
  root.children.set("architecture", arch);
  return { root, sources: [svgSource("pair_1", { name: "icon-1_AI.png", fingerprint: "20:3001" })] };
}

function args(root: FakeDir, sources: SvgSource[], extra: Record<string, unknown>) {
  const events: RunEvent[] = [];
  const config: SvgConfig = { ...DEFAULT_CONFIG, retries: 0, imagesPerRequest: 1 };
  return {
    events,
    run: {
      root, apiKey: ["rq", "live", "text_only_test_key_1234"].join("_"), config, caps: capsFor(config.model),
      params: { temperature: null, maxTokens: 8_000, effort: "low" as const }, prompt: "fix svg", regen: { kind: "main" } as RegenPlan,
      sources, metas: new Map(), onEvent: (e: RunEvent) => events.push(e), signal: new AbortController().signal, ...extra,
    },
  };
}

describe("a text-only run", () => {
  let before = 0;
  beforeEach(() => { before = composites.mock.calls.length; clearInflight(); });
  afterEach(() => { vi.unstubAllGlobals(); clearInflight(); });

  it("API: builds no contact sheet and sends no image part, yet saves the reply", async () => {
    const { root, sources } = fixture();
    const bodies: { messages: { content: { type: string }[] }[] }[] = [];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>icon-1_AI</title><path d="M2 2h20"/></svg>';
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const frame = JSON.stringify({ choices: [{ delta: { content: svg } }] });
      return new Response(`data: ${frame}

data: [DONE]

`, { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    const { run, events } = args(root, sources, { attachImage: false });
    const summary = await runGeneration(run);
    expect(composites.mock.calls.length).toBe(before);
    expect(bodies[0].messages[0].content.map((c) => c.type)).toEqual(["text"]);
    expect(summary.saved).toBe(1);
    const start = events.find((e) => e.kind === "batch-start");
    expect(start && start.kind === "batch-start" ? start.composite : "x").toBe("");
  });

  it("web: hands the helper no image", async () => {
    const { root, sources } = fixture();
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!String(url).endsWith("/aichat/send")) return new Response(JSON.stringify({ ok: true, progress: null }), { status: 200 });
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true, text: "<svg viewBox=\"0 0 1 1\"><path d=\"M0 0\"/></svg>", chatUrl: null }), { status: 200 });
    }));
    const web = createWebTransport({ url: "https://chatgpt.com/c/abc", maxWaitMs: 600_000, readyTimeoutMs: 180_000, stepDelayMs: 0 });
    const { run } = args(root, sources, { attachImage: false, web, apiKey: "" });
    const summary = await runGeneration(run);
    expect(bodies[0].image).toBeNull();
    expect(composites.mock.calls.length).toBe(before);
    expect(summary.saved).toBe(1);
  });

  it("the queued batch keeps the popup's choice; the default still sends the image", () => {
    expect(queueItem({ ids: ["a"], requests: 1, label: "a", attachImage: false }).attachImage).toBe(false);
    expect(queueItem({ ids: ["a"], requests: 1, label: "a" }).attachImage).toBe(true);
  });
});

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLInputElement | null;

describe("the popup checkbox", () => {
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  /** One icon with a real current SVG on disk, so a regeneration can be confirmed. */
  async function mount(operation: "generate" | "regenerate", onConfirm = vi.fn()) {
    const root = new FakeDir("split_root");
    const arch = new FakeDir("architecture");
    root.children.set("architecture", arch);
    const source = svgSource("pair_1", { name: "icon-1_AI.png", fingerprint: "1:100" });
    const path = svgPathFor(source, 1);
    arch.children.set(path.split("/").pop() as string, new FakeFile("icon-1_AI_v1.svg", 10, 1, '<svg viewBox="0 0 24 24"><title>icon-1_AI</title></svg>'));
    const rows = [toRow(source, pairMetaFor(source, [svgVersion(path)]), false)];
    await act(async () => {
      ui.render(<SvgConfirm {...confirmProps({
        ids: ["pair_1"], rows, operation, root, presets: [{ name: "Fix", text: "Fix it." }],
        taskEntries: { "svg.regenerate.single": { choice: "preset", presetName: "Fix" } },
      })} onConfirm={onConfirm} />);
    });
    await quietSettle(0);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    await quietSettle(0);
    return onConfirm;
  }

  it("regeneration: on by default; off sends only the prompt and the SVG code", async () => {
    const onConfirm = await mount("regenerate");
    const box = q("[data-testid=svg-confirm-attach-image]") as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => { box.click(); });
    expect(host.textContent).toContain("Only the prompt and the current SVG code are sent");
    // the full-prompt preview is the text-only wording, prompt at the bottom
    const preview = host.querySelector("[data-testid=svg-confirm-full-prompt]")?.textContent ?? "";
    expect(preview).toContain("no image is attached");
    expect(preview.trim().endsWith("Fix it.")).toBe(true);
    const go = q("[data-testid=svg-confirm-generate]") as unknown as HTMLButtonElement;
    expect(go.disabled).toBe(false);
    await act(async () => { go.click(); });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect((onConfirm.mock.calls[0][0] as ConfirmedBatch).attachImage).toBe(false);
  });

  it("regeneration left ticked confirms with the image, as before", async () => {
    const onConfirm = await mount("regenerate");
    await act(async () => { (q("[data-testid=svg-confirm-generate]") as unknown as HTMLButtonElement).click(); });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect((onConfirm.mock.calls[0][0] as ConfirmedBatch).attachImage).toBeUndefined();
  });

  it("generation: no such box — a first version always needs its image", async () => {
    await mount("generate");
    expect(q("[data-testid=svg-confirm-attach-image]")).toBeNull();
  });
});

describe("the request strip", () => {
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  it("says the request carries no image instead of showing a broken picture", async () => {
    const progress = { runId: "r", batchId: "b", index: 1, batches: 1, count: 1, cols: 1, rows: 1, composite: "", hash: "text-only",
      saved: 0, failed: 0, missing: 0, startedAt: Date.now(), perRequest: 1, images: 1, outcomes: [] } as RunProgress;
    await act(async () => { ui.render(<SvgBatchStrip progress={progress} running onCancel={vi.fn()} />); });
    expect(host.querySelector("[data-testid=svg-batch-composite]")).toBeNull();
    expect(host.querySelector("[data-testid=svg-batch-no-image]")?.textContent).toContain("no image");
  });
});
