// @vitest-environment happy-dom
// svg_builder_stage_nav.test.tsx — quick walking on the stage (2026-11-23):
// ◀ ▶ beside 📂 Location (and the ← → keys) open the previous / next template;
// ↑ ↓ open the previous / next artboard of the template being worked on. A
// changed template or artboard asks Save / Discard first; typing, dialogs and
// focused lists keep their own keys.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { BUILDER_ARTBOARDS_KEY } from "../src/svgBuilder/artboardstore";
import { BUILDER_TEMPLATES_KEY } from "../src/svgBuilder/templatestore";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";
import { currentTemplateId, steppedArtboard, steppedTemplate } from "../src/svgBuilder/stagenav";
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
  let node = root;
  for (const part of dir.split("/")) {
    const next = node.children.get(part);
    if (next instanceof FakeDir) { node = next; continue; }
    const made = new FakeDir(part); node.children.set(part, made); node = made;
  }
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
async function press(key: string, target: EventTarget = document.body): Promise<void> {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
  await settle(0);
}
interface Saved { id: string; name: string; templateId?: string }
const savedTemplates = () => JSON.parse(localStorage.getItem(BUILDER_TEMPLATES_KEY) ?? "[]") as Saved[];
const savedArtboards = () => JSON.parse(localStorage.getItem(BUILDER_ARTBOARDS_KEY) ?? "[]") as Saved[];
const editing = () => ({ kind: q("builder-editing")?.dataset.kind ?? null, text: text("builder-editing") });

async function openLibrary(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === "6", "library scanned");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
}

/** Three templates (the last one edited), and two artboards of the first. */
async function setUp(): Promise<{ t: Saved[]; a: Saved[] }> {
  await openLibrary();
  await click("builder-template-save");
  await click("builder-template-save-new");
  await click("builder-template-save-new");
  const t = savedTemplates();
  await click(`builder-template-add-artboard-${t[0].id}`);
  await click(`builder-template-add-artboard-${t[0].id}`);
  await click(`builder-template-${t[2].id}`); // the stage edits the third template again
  return { t, a: savedArtboards() };
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

describe("stage walking — the pure part", () => {
  const sel = { checked: [], active: null, anchor: null };
  const m = {
    templates: [{ id: "t1" }, { id: "t2" }, { id: "t3" }], artboards: [{ id: "a1", templateId: "t1" }, { id: "a2", templateId: "t1" }, { id: "b1", templateId: "t2" }],
    editingTemplateId: null as string | null, editingArtboardId: null as string | null, templateSel: sel,
  } as never as Parameters<typeof steppedTemplate>[0];
  it("the current template is the open artboard's, else the edited one, else the selected one", () => {
    expect(currentTemplateId({ ...m, editingArtboardId: "b1" })).toBe("t2");
    expect(currentTemplateId({ ...m, editingTemplateId: "t3" })).toBe("t3");
    expect(currentTemplateId({ ...m, templateSel: { ...sel, active: "t1" } })).toBe("t1");
    expect(currentTemplateId(m)).toBeNull();
  });
  it("steps through templates without wrapping; with none current, the first", () => {
    expect([steppedTemplate({ ...m, editingTemplateId: "t2" }, 1), steppedTemplate({ ...m, editingTemplateId: "t2" }, -1)]).toEqual(["t3", "t1"]);
    expect([steppedTemplate({ ...m, editingTemplateId: "t3" }, 1), steppedTemplate({ ...m, editingTemplateId: "t1" }, -1)]).toEqual([null, null]);
    expect(steppedTemplate(m, 1)).toBe("t1");
  });
  it("steps through the template's artboards; from the template ↓ = first, ↑ = last; none at an end or without artboards", () => {
    expect([steppedArtboard({ ...m, editingArtboardId: "a1" }, 1), steppedArtboard({ ...m, editingArtboardId: "a2" }, -1)]).toEqual(["a2", "a1"]);
    expect([steppedArtboard({ ...m, editingArtboardId: "a2" }, 1), steppedArtboard({ ...m, editingArtboardId: "a1" }, -1)]).toEqual([null, null]);
    expect([steppedArtboard({ ...m, editingTemplateId: "t1" }, 1), steppedArtboard({ ...m, editingTemplateId: "t1" }, -1)]).toEqual(["a1", "a2"]);
    expect(steppedArtboard({ ...m, editingTemplateId: "t3" }, 1)).toBeNull();
  });
});

describe("◀ ▶ beside 📂 Location, ← → / ↑ ↓ keys (2026-11-23)", () => {
  it("◀ ▶ open the previous / next template; disabled at the ends", async () => {
    const { t } = await setUp();
    expect(editing().text).toContain(t[2].name);
    expect((q("builder-editing-next-template") as HTMLButtonElement).disabled).toBe(true);
    await click("builder-editing-prev-template");
    expect(editing()).toMatchObject({ kind: "template" });
    expect(editing().text).toContain(t[1].name);
    await click("builder-editing-prev-template");
    expect(editing().text).toContain(t[0].name);
    expect((q("builder-editing-prev-template") as HTMLButtonElement).disabled).toBe(true);
    await click("builder-editing-next-template");
    expect(editing().text).toContain(t[1].name);
  });

  it("← → walk the templates and ↑ ↓ the artboards of the current one; typing keeps its keys", async () => {
    const { t, a } = await setUp();
    await press("ArrowLeft");
    await press("ArrowLeft");
    expect(editing().text).toContain(t[0].name);
    await press("ArrowDown"); // from the template: its first artboard
    expect(editing()).toMatchObject({ kind: "artboard" });
    expect(editing().text).toContain(a[0].name);
    await press("ArrowDown");
    expect(editing().text).toContain(a[1].name);
    await press("ArrowDown"); // the end: stays
    expect(editing().text).toContain(a[1].name);
    await press("ArrowUp");
    expect(editing().text).toContain(a[0].name);
    await press("ArrowRight"); // from an artboard of t1: the next template
    expect(editing()).toMatchObject({ kind: "template" });
    expect(editing().text).toContain(t[1].name);
    await press("ArrowRight", q("builder-search")!); // typing in a field: nothing moves
    expect(editing().text).toContain(t[1].name);
  });

  it("a changed template asks Save / Discard before the arrows leave it", async () => {
    const { t } = await setUp();
    await click("builder-columns-inc"); // an unsaved edit of the third template
    await press("ArrowLeft");
    expect(q("builder-leave-dialog")).not.toBeNull();
    await click("builder-leave-discard");
    expect(editing().text).toContain(t[1].name);
  });
});
