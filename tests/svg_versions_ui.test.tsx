// svg_versions_ui.test.tsx — the versions popup (I-54) drives the REAL panel:
// every recorded version is listed as a tile with its own artwork, the version
// the row shows is marked, ANY version can be made preferred (not only the
// newest), the choice is written into the pair's own file beside the images and
// drives the main preview immediately, and every version stays re-choosable —
// nothing is ever deleted. A write that fails says so and changes nothing.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { parsePairMeta, serializePairMeta, type PairMeta } from "../src/lib/pairmeta";
import { saveCatalog } from "../src/svg/catalog";
import { clearApiKey } from "../src/svg/keystore";
import SvgPanel from "../src/svg/SvgPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import HistoryBar from "../src/ui/HistoryBar";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

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

const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

const FOG = pairId("architecture", "fog", "");
const V1 = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\" fill=\"#c22f2f\"/></svg>";
const V2 = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"#2f6dc2\"/></svg>";

let host: HTMLDivElement;
let ui: Root;

function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** Two generated versions (v1, v2) and one failed attempt (v3) for one pair. */
async function makeRoot(o: { blockWrite?: boolean } = {}): Promise<FakeDir> {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", V1.length, 3200, V1));
  arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", V2.length, 3300, V2));
  const meta = pairFile("architecture", "fog_AI.png", {
    decision: "approved",
    versions: [
      svgVersion("architecture/fog_AI.svg", { version: 1, review: "approved" }),
      svgVersion("architecture/fog_AI_v2.svg", { version: 2 }),
      svgVersion("", { version: 3, status: "failed", valid: false, error: "invalid SVG: unbalanced" }),
    ],
  });
  const sidecar = serializePairMeta(meta); // the file's own shape, never the model's
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", sidecar.length, 3200, sidecar));
  // saveMetaAt writes a tmp file first: one that cannot be written makes the
  // whole write fail, which is exactly the honest failure path.
  if (o.blockWrite) arch.children.set("fog_AI.svg.tmp.json", new BrokenFile("fog_AI.svg.tmp.json"));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function click(el: HTMLElement | null): Promise<void> {
  await act(async () => { el?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function mount(root: FakeDir): Promise<void> {
  stored.set("__svg__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><Host><SvgPanel /><HistoryBar /></Host></HistoryProvider>);
  });
  // boot: handles → scan → pair files → the version's document
  await settle();
  await settle();
}

/** Opens the popup from the row's Versions button and lets every tile load. */
async function openPopup(): Promise<void> {
  await click(q(`[data-testid=svg-history-${FOG}]`));
  await settle();
}

/** The pair file as it sits on disk now. */
function sidecar(root: FakeDir): PairMeta {
  const arch = root.children.get("architecture") as FakeDir;
  const file = arch.children.get("fog_AI.svg.json") as FakeFile;
  const parsed = parsePairMeta(file.text);
  if (!parsed.ok) throw new Error("the pair file no longer parses");
  return parsed.meta;
}

/** The version the main preview draws (its shadow root holds the document). */
function previewVersion(): string {
  return q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version") ?? "";
}

async function openRowPopup(root: FakeDir): Promise<void> {
  await mount(root);
  await openPopup();
}

beforeEach(async () => {
  await dropDb();
  await clearApiKey();
  window.localStorage.clear();
  stored.clear();
  resetAppStore();
  saveCatalog([]); // no catalog: the tests never touch the network
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the versions popup", () => {
  it("lists every recorded version, the newest shown by default, failures as status", async () => {
    const root = await makeRoot();
    await openRowPopup(root);
    expect(text(`[data-testid=svg-history-title]`)).toContain("fog_AI");
    const tiles = [...host.querySelectorAll("[data-testid^='svg-history-v']")].map((t) => t.getAttribute("data-testid"));
    expect(tiles).toEqual(["svg-history-v1", "svg-history-v2", "svg-history-v3"]);
    // every generated version draws its OWN document; the failed one cannot
    expect(art("1")).toContain("#c22f2f");
    expect(art("2")).toContain("#2f6dc2");
    expect(text("[data-testid=svg-history-v3]")).toContain("failed");
    expect(text("[data-testid=svg-history-v3]")).toContain("invalid SVG");
    // the newest version is the one in use when nobody has chosen
    expect(q("[data-testid=svg-history-v2]")?.className).toContain("shown");
    expect((q("[data-testid=svg-history-use-2]") as HTMLButtonElement).disabled).toBe(true); // already shown
    expect((q("[data-testid=svg-history-use-1]") as HTMLButtonElement).disabled).toBe(false);
    // cost and review are still there
    expect(text("[data-testid=svg-history-cost-1]")).toContain("no cost reported");
    expect(text("[data-testid=svg-history-shown]")).toContain("v2");
  });

  it("makes an OLDER version the preferred one, in the file and in the preview", async () => {
    const root = await makeRoot();
    await openRowPopup(root);
    expect(previewVersion()).toBe("2");
    await click(q("[data-testid=svg-history-use-1]"));
    // the main preview switches immediately, without closing the popup
    expect(previewVersion()).toBe("1");
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.shadowRoot?.innerHTML).toContain("#c22f2f");
    // the choice is in the pair's own file, beside the images
    expect(sidecar(root).preferred).toBe(1);
    // the mark moved, the OTHER version now offers the same choice
    expect(q("[data-testid=svg-history-v1]")?.className).toContain("shown");
    expect(q("[data-testid=svg-history-use-2]")).not.toBeNull();
    // nothing was deleted: the whole history is still listed and re-choosable
    expect(sidecar(root).versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(text("[data-testid=svg-history-shown]")).toContain("v1");
    // the copy action follows the shown version too
    await click(q("[data-testid=svg-history-use-2]"));
    expect(sidecar(root).preferred).toBe(2);
    expect(previewVersion()).toBe("2");
  });

  it("survives a reload: the choice is read back from the folder, not from memory", async () => {
    const root = await makeRoot();
    await openRowPopup(root);
    await click(q("[data-testid=svg-history-use-1]"));
    await act(async () => { ui.unmount(); });
    await mount(root); // a restart: a fresh panel, the same folder
    expect(previewVersion()).toBe("1");
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.shadowRoot?.innerHTML).toContain("#c22f2f");
    // and the popup re-opens with the choice marked
    await openPopup();
    expect(q("[data-testid=svg-history-v1]")?.className).toContain("shown");
  });

  it("says one line, logs the change and stays open for another choice", async () => {
    const root = await makeRoot();
    await openRowPopup(root);
    await click(q("[data-testid=svg-history-use-1]"));
    expect(text("[data-testid=svg-toast]")).toContain("Showing v1");
    expect(q("[data-testid=svg-history-dialog]")).not.toBeNull();
  });

  it("claims nothing when the choice cannot be written", async () => {
    const root = await makeRoot({ blockWrite: true });
    await openRowPopup(root);
    expect(previewVersion()).toBe("2");
    await click(q("[data-testid=svg-history-use-1]"));
    expect(previewVersion()).toBe("2"); // unchanged
    expect(text("[data-testid=svg-toast]")).toContain("could not be saved");
    expect(text("[data-testid=svg-history-note]")).toContain("could not be saved");
    expect(sidecar(root).preferred).toBeNull(); // the file still says "nobody chose"
  });

  it("offers the code of every generated version and nothing for a failed one", async () => {
    const root = await makeRoot();
    await openRowPopup(root);
    await click(q("[data-testid=svg-history-code-1]"));
    await settle();
    expect((q("[data-testid=svg-code-block]") as HTMLTextAreaElement).value).toBe(V1);
    await click(q("[data-testid=svg-code-close]"));
    await openPopup();
    expect((q("[data-testid=svg-history-code-3]") as HTMLButtonElement).disabled).toBe(true);
  });
});

/** The drawing of one version's tile, read out of its shadow root. */
function art(version: string): string {
  const tile = q(`[data-testid=svg-history-v${version}]`);
  const svg = tile?.querySelector(`[data-testid='svg-history-art-${version}']`) as HTMLElement | null;
  return svg?.shadowRoot?.innerHTML ?? svg?.innerHTML ?? "";
}
