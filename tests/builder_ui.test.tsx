// tests/builder_ui.test.tsx — RULE 8: the SVG builder's library rail over a real
// (fake) folder tree. Proven here, not in the scan suite: picking a root fills the
// rail with exactly the approved icons, the audit line says what was walked, the
// filters narrow the same list, and an unsupported browser never pretends to have
// scanned anything.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { serializePairMeta } from "../src/lib/pairmeta";
import BuilderPanel from "../src/builder/BuilderPanel";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion, type VerOpts } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const approved = (o: VerOpts = {}) => ({ review: "approved" as const, ...o });

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
  pairDir(root, "weather", "fog_AI.png", { "fog_AI.svg": "<svg/>" },
    seedSidecar("weather", "fog_AI.png", [approved({ version: 1 })]));
  pairDir(root, "weather", "rain_AI.png", { "rain_AI.svg": "<svg/>" },
    seedSidecar("weather", "rain_AI.png", [approved({ version: 1 })]));
  pairDir(root, "kitchen", "pot_AI.png", { "pot_AI.svg": "<svg/>" },
    seedSidecar("kitchen", "pot_AI.png", [approved({ version: 1 })]));
  pairDir(root, "drafts", "swirl_AI.png", { "swirl_AI.svg": "<svg/>" },
    seedSidecar("drafts", "swirl_AI.png", [{ review: "pending", version: 1 }]));
  return root;
}

let host: HTMLDivElement;
let root: Root;

async function mount(dir?: FakeDir): Promise<HTMLDivElement> {
  if (dir) (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<BuilderPanel />); });
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
    pairDir(bare, "drafts", "swirl_AI.png", { "swirl_AI.svg": "<svg/>" },
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
