// tests/builder_ui.test.tsx — RULE 8: the SVG builder's library rail over a real
// (fake) folder tree. Proven here, not in the scan suite: picking a root fills the
// rail with exactly the approved icons, the audit line says what was walked, the
// filters narrow the same list, and an unsupported browser never pretends to have
// scanned anything.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { serializePairMeta } from "../src/lib/pairmeta";
import type { ReactElement } from "react";
import BuilderPanel from "../src/builder/BuilderPanel";
import BuilderArtboard from "../src/builder/BuilderArtboard";
import { DENSE_BUILDER_CONFIG } from "../src/lib/builder/defaults";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion, type VerOpts } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const approved = (o: VerOpts = {}) => ({ review: "approved" as const, ...o });

/** Real approved artwork: one path with its own box, so a cell can draw it. */
const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;

/** One pair folder with its sidecar and the named SVG files. */
function pairDir(root: FakeDir, dir: string, aiName: string, files: Record<string, string>, sidecar: string): void {
  let node = root;
  for (const part of dir.split("/").filter(Boolean)) {
    const found = node.children.get(part);
    if (found instanceof FakeDir) { node = found; continue; }
    const made = new FakeDir(part);
    node.children.set(part, made);
    node = made;
  }
  const stem = aiName.replace(/\.png$/i, "");
  node.children.set(aiName, new FakeFile(aiName, 20, 3100, "ai"));
  node.children.set(`${stem}.svg.json`, new FakeFile(`${stem}.svg.json`, 10, 3300, sidecar));
  for (const [name, text] of Object.entries(files)) node.children.set(name, new FakeFile(name, text.length, 3400, text));
}

function seedSidecar(dir: string, aiName: string, versions: Parameters<typeof svgVersion>[1][]): string {
  const stem = aiName.replace(/\.png$/i, "");
  return serializePairMeta(pairFile(dir, aiName, {
    versions: versions.map((o, i) => svgVersion(`${dir}/${stem}_v${o?.version ?? i + 1}.svg`, o)),
  }));
}

/** Three approved icons in two folders, one pending pair. */
function libraryRoot(): FakeDir {
  const root = new FakeDir("icon_library");
  pairDir(root, "weather", "fog_AI.png", { "fog_AI.svg": ART },
    seedSidecar("weather", "fog_AI.png", [approved({ version: 1 })]));
  pairDir(root, "weather", "rain_AI.png", { "rain_AI.svg": ART },
    seedSidecar("weather", "rain_AI.png", [approved({ version: 1 })]));
  pairDir(root, "kitchen", "pot_AI.png", { "pot_AI.svg": ART },
    seedSidecar("kitchen", "pot_AI.png", [approved({ version: 1 })]));
  pairDir(root, "drafts", "swirl_AI.png", { "swirl_AI.svg": ART },
    seedSidecar("drafts", "swirl_AI.png", [{ review: "pending", version: 1 }]));
  return root;
}

let host: HTMLDivElement;
let root: Root;

async function mount(dir?: FakeDir): Promise<HTMLDivElement> {
  if (dir) (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  return mountNode(<BuilderPanel />);
}

/** Renders any node (a component's own contract, not the whole panel). */
async function mountNode(node: ReactElement): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(node); });
  return host;
}

const q = (testid: string): HTMLElement | null => host.querySelector(`[data-testid="${testid}"]`);
const qa = (testid: string): HTMLElement[] => [...host.querySelectorAll(`[data-testid="${testid}"]`)] as HTMLElement[];

/** React tracks input values, so the native setter must be used to change one. */
async function setValue(testid: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(testid) as HTMLInputElement; // re-read: React may have re-created it
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element | null): Promise<void> {
  expect(el).not.toBeNull();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

/** Picks the folder and waits for the scan to land in the rail. */
async function pick(): Promise<void> {
  await click(q("builder-open-folder"));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

function railNames(): string[] {
  return qa("builder-icon-name").map((n) => n.textContent ?? "");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  window.localStorage.clear();
});

afterEach(async () => {
  if (root) { await act(async () => root.unmount()); }
  host?.remove();
  vi.restoreAllMocks();
  delete (window as unknown as PickerWindow).showDirectoryPicker;
});

describe("SVG builder — the library rail", () => {
  it("shows the approved icons of the picked folder, and only those", async () => {
    await mount(libraryRoot());
    expect(q("builder-root-empty")).not.toBeNull();
    await pick();
    expect(railNames()).toEqual(["pot", "fog", "rain"]); // folder, then name — the scan's order
    expect(q("builder-root-empty")).toBeNull();
  });

  it("says what the scan walked and what it left out", async () => {
    await mount(libraryRoot());
    await pick();
    const audit = q("builder-audit")?.textContent ?? "";
    expect(audit).toContain("3 approved");
    expect(audit).toContain("1 not listed"); // the pending pair, reported not hidden
    expect(q("builder-scope-copy")?.textContent).toContain("3 icons");
  });

  it("a search narrows the same list and clearing it restores every icon", async () => {
    await mount(libraryRoot());
    await pick();
    await setValue("builder-search", "pot");
    expect(railNames()).toEqual(["pot"]);
    await setValue("builder-search", "");
    expect(railNames()).toEqual(["pot", "fog", "rain"]); // folder, then name — the scan's order
  });

  it("a folder chip filters to that folder", async () => {
    await mount(libraryRoot());
    await pick();
    const chip = qa("builder-facet-folder").find((c) => c.textContent?.includes("weather"));
    expect(chip).toBeDefined();
    await click(chip!);
    expect(railNames()).toEqual(["fog", "rain"]);
  });

  it("an empty approved library says so, with the reason, instead of an empty rail", async () => {
    const bare = new FakeDir("icon_library");
    pairDir(bare, "drafts", "swirl_AI.png", { "swirl_AI.svg": ART },
      seedSidecar("drafts", "swirl_AI.png", [{ review: "pending", version: 1 }]));
    await mount(bare);
    await pick();
    expect(railNames()).toEqual([]);
    expect(q("builder-library-empty")?.textContent).toContain("approve");
  });

  it("a browser without folder access never shows a rail", async () => {
    await mount();
    expect(q("builder-panel")).toBeNull();
    expect(q("builder-unsupported")).not.toBeNull();
  });
});

describe("SVG builder — the artboard (P2)", () => {
  it("draws one cell per grid position, with the caption under each icon", async () => {
    await mount(libraryRoot());
    await pick();
    // P2 default sheet: 4 × 3 cells, captions on, the first approved icons placed.
    expect(qa("builder-cell")).toHaveLength(12);
    expect(q("builder-artboard")).not.toBeNull();
    const caption = qa("builder-cell-caption")[0]?.textContent ?? "";
    expect(caption).not.toBe("");
  });

  it("shows the artwork it was given, not a placeholder", async () => {
    await mount(libraryRoot());
    await pick();
    const drawn = qa("builder-cell-icon");
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn[0].innerHTML).toContain("path");
    expect(q("builder-cell-refused")).toBeNull(); // the fixture artwork is drawable
  });

  it("empty cells are holes that say so, never a silent blank", async () => {
    await mount(libraryRoot()); // 3 approved icons, 12 cells
    await pick();
    expect(qa("builder-cell").length - qa("builder-cell-icon").length).toBe(9);
    expect(q("builder-overflow")).toBeNull(); // it fits: no warning
  });

  it("says out loud when the grid has to shrink to fit", async () => {
    // 16 × 16 of 120px boxes cannot fit a 1000 × 800 sheet: the artboard must say so.
    await mountNode(<BuilderArtboard config={DENSE_BUILDER_CONFIG} slots={[]} placed={new Map()} zoom={0.5} />);
    expect(q("builder-overflow")?.textContent ?? "").toMatch(/shrink|fit/i);
    expect(q("builder-canvas")).not.toBeNull();
  });

  it("reports the artboard's size in the open", async () => {
    await mount(libraryRoot());
    await pick();
    expect(q("builder-artboard-size")?.textContent).toContain("1000 × 800");
  });
});
