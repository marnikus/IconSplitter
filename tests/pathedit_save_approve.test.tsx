// pathedit_save_approve.test.tsx — Ctrl+Shift+S ("Save, approve & next SVG") and
// Ctrl+Shift+X ("Discard, decline & next SVG") in edit mode:
// - Ctrl+Shift+S saves unsaved changes (if any), marks the SVG approved, and moves next.
// - Ctrl+Shift+X discards unsaved changes, marks the SVG declined (✕ marker), and moves next.
// - Each review decision records its own svgReview undo step (already-matching status records nothing).
// - On the last editable row (canNext = false), both still apply their review marker and close the modal.
// - The leave question's "Save and go" / "Discard and go" stay navigation-only (no review change).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";
import SvgPathEditor, { type EditNav } from "../src/svg/pathedit/SvgPathEditor";
import SvgEditModal from "../src/svg/pathedit/SvgEditModal";
import { closeSvgEditor, getSvgEditorId, openSvgEditor } from "../src/svg/pathedit/editmodalstore";
import { toRow } from "../src/svg/rowmodel";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { settle, waitUntil } from "./helpers/quiet";

const applied = vi.hoisted(() => ({ recs: [] as unknown[] }));
vi.mock("../src/svg/reviewundo", async (orig) => {
  const actual = await orig<typeof import("../src/svg/reviewundo")>();
  return { ...actual, applySvgReviewPatch: vi.fn(async (p: { recs: unknown[] }) => { applied.recs.push(...p.recs); return true; }) };
});
import { approveEditedSvg, declineEditedSvg, useSvgEditBinding } from "../src/svg/svgedit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
  .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => {
  applied.recs = [];
  closeSvgEditor();
  for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
  host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
});
afterEach(() => {
  closeSvgEditor();
  act(() => ui.unmount());
  host.remove();
  for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM;
});

const SRC = '<svg viewBox="0 0 24 24"><path d="M2 2L12 2L12 12"/></svg>';
const key = (k: string, mods: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods });
const pointer = (t: EventTarget, type: string, x: number, y: number) =>
  t.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));

async function mount(overrides: Partial<EditNav> = {}) {
  const onGo = vi.fn();
  const nav: EditNav = { canPrev: true, canNext: true, position: "1 / 2", onGo, ...overrides };
  await act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} nav={nav} />); });
  return onGo;
}

describe("Ctrl+Shift+S = save, approve & next", () => {
  it("with changes: hands over the rewritten file and asks to approve", async () => {
    const onGo = await mount();
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
    await act(async () => { window.dispatchEvent(key("S", { ctrlKey: true, shiftKey: true })); });
    expect(onGo).toHaveBeenLastCalledWith(1, expect.stringContaining('d="M2 2L14 4L12 12"'), "approved");
  });

  it("with nothing changed it still approves and goes on", async () => {
    const onGo = await mount();
    await act(async () => { window.dispatchEvent(key("S", { ctrlKey: true, shiftKey: true })); });
    expect(onGo).toHaveBeenLastCalledWith(1, null, "approved");
  });

  it("the leave question's Save and go and Discard and go do not change review", async () => {
    const onGo = await mount();
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
    await act(async () => { window.dispatchEvent(key("Escape")); });
    await act(async () => { window.dispatchEvent(key("ArrowRight")); });
    await act(async () => { (host.querySelector("[data-testid=e-leave-save]") as HTMLButtonElement).click(); });
    expect(onGo.mock.calls.at(-1)?.[2]).toBeUndefined();
    await act(async () => { window.dispatchEvent(key("ArrowRight")); });
    await act(async () => { (host.querySelector("[data-testid=e-leave-discard]") as HTMLButtonElement).click(); });
    expect(onGo.mock.calls.at(-1)).toEqual([1, null]);
  });

  it("the legend names both Save, approve & next SVG and Discard, decline & next SVG", () => {
    expect(EDIT_HOTKEYS.find((h) => h.keys === "Ctrl+Shift+S")?.text).toBe("Save, approve & next SVG");
    expect(EDIT_HOTKEYS.find((h) => h.keys === "Ctrl+Shift+X")?.text).toBe("Discard, decline & next SVG");
  });
});

describe("Ctrl+Shift+X = discard, decline & next", () => {
  it("with unsaved changes: discards changes, asks to decline, and moves next without prompting", async () => {
    const onGo = await mount();
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
    await act(async () => { window.dispatchEvent(key("X", { ctrlKey: true, shiftKey: true })); });
    expect(host.querySelector("[data-testid=e-leave]")).toBeNull();
    expect(onGo).toHaveBeenLastCalledWith(1, null, "declined");
  });

  it("with nothing changed, and even on the last row (canNext = false), it still marks declined", async () => {
    const onGo = await mount({ canNext: false });
    await act(async () => { window.dispatchEvent(key("X", { ctrlKey: true, shiftKey: true })); });
    expect(onGo).toHaveBeenLastCalledWith(1, null, "declined");
  });
});

describe("approveEditedSvg and declineEditedSvg", () => {
  function Bind({ push }: { push: (e: unknown) => void }) { useSvgEditBinding({ current: null }, { push: push as never }); return null; }

  it("approveEditedSvg marks the item approved and records its own svgReview undo step", async () => {
    const push = vi.fn();
    await act(async () => { ui.render(<Bind push={push} />); });
    await expect(approveEditedSvg("r1", "pending", "icon SVG v2")).resolves.toBe(true);
    expect(applied.recs).toEqual([{ id: "r1", review: "approved" }]);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      type: "svgReview", label: "Approve icon SVG v2", ids: ["r1"],
      before: { recs: [{ id: "r1", review: "pending" }] }, after: { recs: [{ id: "r1", review: "approved" }] },
    }));
  });

  it("an item that is already approved records nothing", async () => {
    const push = vi.fn();
    await act(async () => { ui.render(<Bind push={push} />); });
    await expect(approveEditedSvg("r1", "approved", "x")).resolves.toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("declineEditedSvg marks the item declined and records its own svgReview undo step", async () => {
    const push = vi.fn();
    await act(async () => { ui.render(<Bind push={push} />); });
    await expect(declineEditedSvg("r1", "approved", "icon SVG v2")).resolves.toBe(true);
    expect(applied.recs).toEqual([{ id: "r1", review: "declined" }]);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      type: "svgReview", label: "Decline icon SVG v2", ids: ["r1"],
      before: { recs: [{ id: "r1", review: "approved" }] }, after: { recs: [{ id: "r1", review: "declined" }] },
    }));
  });

  it("an item that is already declined records nothing", async () => {
    const push = vi.fn();
    await act(async () => { ui.render(<Bind push={push} />); });
    await expect(declineEditedSvg("r1", "declined", "x")).resolves.toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("SvgEditModal Ctrl+Shift+X end-to-end", () => {
  function makeRow(id: string): SvgRow {
    const source = { id, stem: id, name: `${id}.png`, relPath: `${id}.png`, relDir: "", metaPath: `${id}.icon-splitter.json` };
    const ver = {
      version: 1, svgPath: `${id}.svg`, status: "generated" as const, review: "pending" as const,
      createdAt: "2026-11-19T00:00:00Z", model: "m", promptHash: "p", validation: { ok: true, errors: [], warnings: [], icons: 1 },
    };
    const meta = {
      schema: 1, pairId: id, ai: { relPath: `${id}.png`, fingerprint: "f" },
      imagePreferred: null, imageVersions: [], versions: [ver], preferred: null, review: "pending" as const,
    };
    return toRow(source as never, meta as never, false);
  }

  it("marks row 1 declined and advances to row 2; on row 2 marks it declined and closes edit mode", async () => {
    const push = vi.fn();
    const dir = new FakeDir("root");
    dir.children.set("a.svg", new FakeFile("a.svg", SRC.length, 1000, SRC));
    dir.children.set("b.svg", new FakeFile("b.svg", SRC.length, 1000, SRC));
    const rootRef = { current: dir };
    const rows = [makeRow("a"), makeRow("b")];
    function Harness() {
      useSvgEditBinding(rootRef, { push: push as never });
      return <SvgEditModal rows={rows} rootRef={rootRef} rootToken={1} />;
    }
    openSvgEditor("a");
    await act(async () => { ui.render(<Harness />); });
    await waitUntil(() => host.querySelector("[data-testid=svg-edit-a-editor]") !== null, "row a editor");
    await act(async () => { window.dispatchEvent(key("X", { ctrlKey: true, shiftKey: true })); });
    await settle();
    expect(applied.recs).toEqual([{ id: "a", review: "declined" }]);
    expect(getSvgEditorId()).toBe("b");
    await waitUntil(() => host.querySelector("[data-testid=svg-edit-b-editor]") !== null, "row b editor");

    await act(async () => { window.dispatchEvent(key("X", { ctrlKey: true, shiftKey: true })); });
    await settle();
    expect(applied.recs).toEqual([{ id: "a", review: "declined" }, { id: "b", review: "declined" }]);
    expect(getSvgEditorId()).toBeNull();
  });
});
