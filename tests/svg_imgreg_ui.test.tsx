// svg_imgreg_ui.test.tsx — AI source image regeneration (user request
// 2026-10-16): the guarded row/bulk action, the confirm dialog with the SAME
// prompt + preset list as SVG generation, the batch run that writes versioned
// images into "AI source regeneration versions", and the version chips that
// switch the MAIN image (persisted in the pair file, I-54).
import { act } from "react";
import * as fakeIndexedDb from "fake-indexeddb";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { newPairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { clearApiKey, saveApiKey } from "../src/svg/keystore";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import SvgPanel from "../src/svg/SvgPanel";
import { runImageBatch } from "../src/svg/imgrunner";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// The network is never real: the runner returns one PNG per item, recorded.
const runs: { items: unknown[]; prompt: string }[] = [];
vi.mock("../src/svg/imgrunner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/imgrunner")>();
  return {
    ...actual,
    runImageBatch: vi.fn(async (args: { items: { id: string }[]; prompt: string }) => {
      runs.push({ items: args.items, prompt: args.prompt });
      return args.items.map((i) => ({ id: i.id, status: "done" as const, blob: new Blob(["PNGDATA"], { type: "image/png" }) }));
    }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOG = pairId("architecture", "fog", "");
const w = window as unknown as { showDirectoryPicker?: () => Promise<unknown> };

/** One approved pair: architecture/fog with its reference and AI image. */
async function makeRoot(): Promise<FakeDir> {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: `${FOG}.png`, ai_result: `${FOG}_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  const pairMeta = newPairMeta({ id: FOG, base: "fog", suffix: "", dirPath: "architecture",
    ai: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
    source: { relPath: "architecture/fog.png", name: "fog.png", fingerprint: "12:3000" } });
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3200, serializePairMeta(pairMeta)));
  return root;
}

let host: HTMLDivElement;
let ui: Root | undefined;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await settle(30); };
const choose = async (sel: string, text: string) => {
  const el = q(sel) as HTMLSelectElement;
  const opt = Array.from(el.options).find((o) => o.text.includes(text))!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, opt.value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};
const meta = async () => {
  const root = stored.get("__svg__") as { source: FakeDir } | undefined;
  const arch = root!.source.children.get("architecture") as FakeDir;
  const file = arch.children.get("fog_AI.svg.json") as FakeFile | undefined;
  return file ? JSON.parse(file.text) : null;
};

beforeEach(async () => {
  await dropDb();
  await clearApiKey();
  await saveApiKey("rq_test_key");
  window.localStorage.clear();
  stored.clear();
  runs.length = 0;
  vi.mocked(runImageBatch).mockClear();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  if (ui !== undefined) { const r = ui; await act(async () => r.unmount()); }
  ui = undefined;
  ui = undefined;
  host.remove();
  vi.unstubAllGlobals();
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
});

/** Mount, pick the fixture root, switch to the Sunburst image connection. */
async function mountWithImages(): Promise<void> {
  const root = await makeRoot();
  w.showDirectoryPicker = () => Promise.resolve(root);
  await act(async () => {
    const r = createRoot(host);
    ui = r;
    r.render(<HistoryProvider><SvgPanel /></HistoryProvider>);
  });
  await settle();
  await click(q("[data-testid=svg-open-folder]")!);
  await settle(150);
  await settle(300);
  await choose("[data-testid=svg-connection-select]", "Sunburst");
}

describe("image regeneration — the guard", () => {
  it("the bulk action refuses honestly while a TEXT connection is active", async () => {
    const root = await makeRoot();
    w.showDirectoryPicker = () => Promise.resolve(root);
    await act(async () => { const r = createRoot(host); ui = r; r.render(<HistoryProvider><SvgPanel /></HistoryProvider>); });
    await settle();
    await click(q("[data-testid=svg-open-folder]")!);
    await settle(150);
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    expect(q("[data-testid=svg-img-confirm]")).toBeNull();
    expect(q("[data-testid=svg-toast]")?.textContent ?? "").toMatch(/image connection/i);
  });
});

describe("image regeneration — the confirmed batch", () => {
  it("the dialog shows the image provider, the prompt and the shared presets; Generate writes version 1 and makes it main", async () => {
    await mountWithImages();
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    const dialog = q("[data-testid=svg-img-confirm]");
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toMatch(/Sunburst/);
    expect(q("[data-testid=svg-img-prompt]")).not.toBeNull();
    expect(q("[data-testid=svg-img-preset]")).not.toBeNull();
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(200);
    const m = await meta();
    expect(m.imageVersions).toHaveLength(1);
    expect(m.imageVersions[0].file).toBe("architecture/AI source regeneration versions/fog_AI_v1.png");
    expect(m.imagePreferred).toBe(1);
    const root = stored.get("__svg__") as { source: FakeDir };
    const regen = (root.source.children.get("architecture") as FakeDir).children.get("AI source regeneration versions") as FakeDir;
    expect([...regen.children.keys()]).toEqual(["fog_AI_v1.png"]);
    expect(runs[0].prompt.length).toBeGreaterThan(0);
    // the row's version bar shows the new main
    expect(q(`[data-testid=svg-ai-chip-${FOG}-1]`)?.getAttribute("data-active")).toBe("true");
  });

  it("a second run appends v2; clicking v1's chip makes it main again", async () => {
    await mountWithImages();
    await click(q("[data-testid=svg-check-all]")!);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(150);
    await click(q("[data-testid=svg-bulk-image-regen]")!);
    await click(q("[data-testid=svg-img-generate]")!);
    await settle(150);
    expect((await meta()).imagePreferred).toBe(2);
    await click(q(`[data-testid=svg-ai-chip-${FOG}-1]`)!);
    await settle(150);
    expect((await meta()).imagePreferred).toBe(1);
  });

  it("the dialog is a real modal: backdrop + dialog section holding the prompt and Generate", async () => {
    await mountWithImages();
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    const backdrop = q("[data-testid=svg-img-confirm]")!;
    expect(backdrop.className).toContain("svg-backdrop");
    const modal = backdrop.querySelector("section.svg-modal[role=dialog]");
    expect(modal).not.toBeNull();
    expect(modal!.contains(q("[data-testid=svg-img-prompt]"))).toBe(true);
    expect(modal!.contains(q("[data-testid=svg-img-generate]"))).toBe(true);
  });

  it("the row stays one grid cell per header column; the image action lives INSIDE the decision cell", async () => {
    await mountWithImages();
    const row = q(`[data-testid=svg-row-${FOG}]`)!;
    const columns = q(".svg-columns")!;
    expect(row.children.length).toBe(columns.children.length);
    const button = q(`[data-testid=svg-row-image-regen-${FOG}]`)!;
    expect(button.parentElement?.classList.contains("svg-decision-actions")).toBe(true);
    expect(button.parentElement?.parentElement).toBe(row);
  });

  it("the image button looks like the SVG Regenerate button, split from the vector buttons by a separator", async () => {
    await mountWithImages();
    const svgBtn = q(`[data-testid=svg-generate-${FOG}]`)!;
    const imgBtn = q(`[data-testid=svg-row-image-regen-${FOG}]`)!;
    for (const cls of ["svg-btn", "tiny", "primary"]) {
      expect(imgBtn.classList.contains(cls)).toBe(svgBtn.classList.contains(cls));
    }
    const sep = q(`[data-testid=svg-row-${FOG}] .svg-decision-sep`)!;
    expect(sep).not.toBeNull();
    const order = [...imgBtn.parentElement!.children];
    expect(order.indexOf(svgBtn)).toBeLessThan(order.indexOf(sep));
    expect(order.indexOf(sep)).toBeLessThan(order.indexOf(imgBtn));
  });

  it("the row action opens the same dialog for just that row", async () => {
    await mountWithImages();
    await click(q(`[data-testid=svg-row-image-regen-${FOG}]`)!);
    expect(q("[data-testid=svg-img-confirm]")).not.toBeNull();
    await click(q("[data-testid=svg-img-cancel]")!);
    expect(q("[data-testid=svg-img-confirm]")).toBeNull();
  });
});
