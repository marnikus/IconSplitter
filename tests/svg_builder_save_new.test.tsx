// @vitest-environment happy-dom
// svg_builder_save_new.test.tsx — ＋ Save as new template on the stage
// (2026-11-23): whenever a template or an artboard is on the stage, its look can
// be kept as a NEW template; the original stays as it was. From a template the
// new one becomes the edited template; from an artboard the artboard stays open
// (its own words, icons and draft untouched) and nothing else looks edited.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { BUILDER_TEMPLATES_KEY } from "../src/svgBuilder/templatestore";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, saveHandles: vi.fn(async () => undefined), loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';

function addPair(root: FakeDir, dir: string, stem: string): void {
  let node = root.children.get(dir) as FakeDir | undefined;
  if (node === undefined) { node = new FakeDir(dir); root.children.set(dir, node); }
  const meta = serializePairMeta(pairFile(dir, `${stem}_AI.png`, { versions: [svgVersion(`${dir}/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
  node.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
  node.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
  node.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (id: string) => q(id)?.textContent ?? "";
async function click(id: string): Promise<void> {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
}
interface Saved { id: string; name: string; config: { grid: { columns: number } } }
const saved = () => JSON.parse(localStorage.getItem(BUILDER_TEMPLATES_KEY) ?? "[]") as Saved[];
const editing = () => ({ kind: q("builder-editing")?.dataset.kind ?? null, text: text("builder-editing") });

async function oneTemplate(): Promise<Saved> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === "6", "library scanned");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
  await click("builder-template-save");
  return saved()[0];
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetAppStore();
  const root = new FakeDir("icons");
  ["apple", "bread", "cake", "home", "gear", "bell"].forEach((s) => addPair(root, "icons", s));
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => root;
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  setIndexRuntime(null);
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});

describe("＋ Save as new template on the stage (2026-11-23)", () => {
  it("from an edited template: the changed look becomes a new template, the original stays", async () => {
    const first = await oneTemplate();
    expect(q("builder-stage-template-save-new")).not.toBeNull(); // offered even before a change
    await click("builder-columns-inc");
    await click("builder-stage-template-save-new");
    const [kept, made] = saved();
    expect(kept.config.grid.columns).toBe(first.config.grid.columns);
    expect(made.config.grid.columns).toBe(first.config.grid.columns + 1);
    expect(editing()).toMatchObject({ kind: "template" });
    expect(editing().text).toContain(made.name);
  });

  it("from an open artboard: its look becomes a new template and the artboard stays open", async () => {
    const first = await oneTemplate();
    await click(`builder-template-add-artboard-${first.id}`);
    await waitUntil(() => editing().kind === "artboard", "artboard open");
    const artboardLabel = editing().text;
    await click("builder-columns-inc"); // the artboard's own look change (a draft)
    await click("builder-stage-template-save-new");
    expect(saved()).toHaveLength(2);
    expect(saved()[1].config.grid.columns).toBe(first.config.grid.columns + 1);
    expect(editing()).toMatchObject({ kind: "artboard", text: artboardLabel });
    expect(q("builder-template-editing")).toBeNull(); // no template looks edited while the artboard is open
    expect(q("builder-stage-artboard-save")).not.toBeNull(); // its draft is still there to save
  });
});
