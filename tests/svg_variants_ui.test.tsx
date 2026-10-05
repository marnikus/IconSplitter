// svg_variants_ui.test.tsx — versions and the preferred one (2026-10-05, RUN-3):
// the popup lists EVERY recorded version for one icon with its own artwork, the
// user may pick any valid one as preferred — a choice that deletes nothing and
// is written into that pair's own file — and the main preview, Code and Copy
// then hand out the chosen version, across a restart and through undo.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import SvgPanel from "../src/svg/SvgPanel";
import HistoryBar from "../src/ui/HistoryBar";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

(globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker = () => Promise.reject(new Error("no picker"));

const FOG = pairId("architecture", "fog", "");
/** Two valid documents with a visible difference: which one a target reads. */
const SVG_V1 = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
const SVG_V2 = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/></svg>";

let host: HTMLDivElement;
let ui: Root;

function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

function version(n: number, svgPath: string, status: "generated" | "failed") {
  return {
    version: n, svgPath, status, review: "pending", prompt: "p", provider: "Requesty",
    model: "openai/gpt-6.1-sol", requestedAt: `2026-10-0${n}T10:00:00.000Z`,
    completedAt: `2026-10-0${n}T10:00:05.000Z`,
    usage: { input: 100 * n, output: 200 * n, total: 300 * n },
    cost: { actual: 0.01 * n, estimated: null, currency: "USD", pricing: "", basis: "provider" },
    validation: { ok: status === "generated", errors: status === "generated" ? [] : ["bad"], warnings: [], icons: 1 },
    batch: null, error: status === "generated" ? null : "invalid SVG", requestId: null,
  };
}

/** fog: v1 + v2 both generated, v3 a failed attempt; nothing preferred yet. */
function pairFile(preferredVersion: number | null = null): string {
  return JSON.stringify({
    v: 3,
    pair: { id: FOG, base: "fog", suffix: "", dir: "architecture" },
    ai: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
    source: { relPath: "architecture/fog.png", name: "fog.png", fingerprint: "12:3000" },
    decision: "approved", reviewedAt: "2026-10-01T09:00:00.000Z",
    preferredVersion,
    versions: [
      version(1, "architecture/fog_AI.svg", "generated"),
      version(2, "architecture/fog_AI_v2.svg", "generated"),
      version(3, "", "failed"),
    ],
  });
}

async function makeRoot(preferredVersion: number | null = null): Promise<FakeDir> {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", SVG_V1.length, 3200, SVG_V1));
  arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", SVG_V2.length, 3300, SVG_V2));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3200, pairFile(preferredVersion)));
  root.children.set("architecture", arch);
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
    records: [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }],
  })));
  return root;
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";

async function click(sel: string): Promise<void> {
  const el = q(sel);
  if (el === null) throw new Error(`no element for ${sel}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function mount(root: FakeDir): Promise<void> {
  stored.set("__svg__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><Host><SvgPanel /><HistoryBar /></Host></HistoryProvider>);
  });
  await settle();
}

type JsonFile = { text: string };
const sidecar = (root: FakeDir) =>
  JSON.parse(((root.children.get("architecture") as FakeDir).children.get("fog_AI.svg.json") as unknown as JsonFile).text) as {
    preferredVersion: number | null; versions: unknown[];
  };

function stubClipboard(read: string): string[] {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    value: { readText: async () => read, writeText: async (t: string) => { written.push(t); } },
    configurable: true,
  });
  return written;
}

beforeEach(async () => {
  localStorage.clear();
  resetAppStore();
  await dropDb();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => { ui?.unmount(); });
  host.remove();
});

describe("Generate SVG versions and the preferred one (RUN-3)", () => {
  it("lists every recorded version — failed ones included — with its own artwork", async () => {
    await mount(await makeRoot());
    await click(`[data-testid=svg-history-${FOG}]`);
    expect(q("[data-testid=svg-history-dialog]")).not.toBeNull();
    for (const n of [1, 2, 3]) expect(q(`[data-testid=svg-history-v${n}]`)).not.toBeNull();
    // each valid version draws itself in the popup; the failed attempt has none
    await settle();
    expect(q("[data-testid=svg-version-art-1]")).not.toBeNull();
    expect(q("[data-testid=svg-version-art-2]")).not.toBeNull();
    expect(q("[data-testid=svg-version-art-3]")).toBeNull();
    expect((q("[data-testid=svg-prefer-3]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("chooses an older version as preferred, deletes nothing, and Copy hands out that version", async () => {
    const root = await makeRoot();
    const written = stubClipboard(SVG_V1);
    await mount(root);
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version")).toBe("2");

    await click(`[data-testid=svg-history-${FOG}]`);
    await click("[data-testid=svg-prefer-1]");
    expect(sidecar(root).preferredVersion).toBe(1);
    expect(sidecar(root).versions).toHaveLength(3); // a choice, never a deletion
    expect(text(`[data-testid=svg-history-v1]`)).toContain("Preferred");
    // every other version stays re-choosable
    expect((q("[data-testid=svg-prefer-2]") as HTMLButtonElement).disabled).toBe(false);

    // leaving the popup, the row previews v1 and the target path names its file
    await click("[data-testid=svg-history-done]");
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version")).toBe("1");
    expect(text(`[data-testid=svg-target-${FOG}]`)).toBe("architecture/fog_AI.svg");

    // Copy hands over exactly the preferred document
    await click(`[data-testid=svg-copy-${FOG}]`);
    expect(written).toEqual([SVG_V1]);
  });

  it("remembers the choice across a restart and can go back to the newest", async () => {
    const root = await makeRoot();
    await mount(root);
    await click(`[data-testid=svg-history-${FOG}]`);
    await click("[data-testid=svg-prefer-1]");
    await click("[data-testid=svg-history-done]");
    await act(async () => { ui.unmount(); }); // the tab is rebuilt from disk
    await mount(root);
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version")).toBe("1");

    await click(`[data-testid=svg-history-${FOG}]`);
    await click("[data-testid=svg-prefer-newest]");
    expect(sidecar(root).preferredVersion).toBeNull();
    await click("[data-testid=svg-history-done]");
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version")).toBe("2");
  });

  it("is one undoable step: Undo restores the version that was preferred before", async () => {
    const root = await makeRoot();
    await mount(root);
    await click(`[data-testid=svg-history-${FOG}]`);
    await click("[data-testid=svg-prefer-1]");
    await click("[data-testid=svg-history-done]");
    expect(sidecar(root).preferredVersion).toBe(1);

    await click("[data-testid=hist-undo]");
    expect(sidecar(root).preferredVersion).toBeNull();
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version")).toBe("2");
  });

  it("refuses to prefer a version that never produced a document", async () => {
    const root = await makeRoot();
    await mount(root);
    await click(`[data-testid=svg-history-${FOG}]`);
    await click("[data-testid=svg-prefer-3]");
    expect(sidecar(root).preferredVersion).toBeNull();
  });
});
