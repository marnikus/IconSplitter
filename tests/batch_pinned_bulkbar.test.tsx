// batch_pinned_bulkbar.test.tsx — the split controls bar pins to the top while
// the user scrolls the rows (user request 2026-10-16, screenshot). CSS does the
// pinning (the scroll container is .app-main); these gates pin the CONTRACT:
// the sticky rule exists, and the bar is wrapped in the pin as a direct child
// of the tab shell in the same visual position (after filters, before rows).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import { dropDb } from "./helpers/idb";
import { setImageDecodeTimeout } from "../src/lib/dom";
import BatchPanel from "../src/batch/BatchPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** Declarations of `selector`'s rule block (layout_fullwidth precedent). */
function decls(sheet: string, selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out: string[] = [];
  for (const m of sheet.matchAll(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const d of m[1].split(";")) {
      const t = d.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = async (ms = 80) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

beforeEach(async () => {
  setImageDecodeTimeout(25);
  localStorage.clear();
  await dropDb();
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<BatchPanel />); });
  await settle(120);
});

afterEach(async () => {
  await act(async () => ui.unmount());
  host.remove();
  setImageDecodeTimeout(8000);
  vi.unstubAllGlobals();
});

describe("pinned bulk bar — the CSS contract", () => {
  it(".batch-bulkbar-pin is sticky at the top of the scroll container", () => {
    const rule = decls(css(), ".batch-bulkbar-pin");
    expect(rule.some((d) => d.replace(/\s/g, "").startsWith("position:sticky"))).toBe(true);
    expect(rule.some((d) => d.replace(/\s/g, "").startsWith("top:0"))).toBe(true);
  });
});

describe("pinned bulk bar — the DOM contract", () => {
  it("the pin wraps the bulk bar", () => {
    const pin = q("[data-testid=batch-bulkbar-pin]");
    expect(pin).not.toBeNull();
    expect(pin!.querySelector("[data-testid=batch-select-visible]")).not.toBeNull();
    expect(pin!.querySelector("[data-testid=batch-bulk]")).not.toBeNull();
  });

  it("the bar is OUT of the small controls stack (a sticky box must span the list)", () => {
    const pin = q("[data-testid=batch-bulkbar-pin]")!;
    const stack = pin.closest(".batch-controls-stack");
    expect(stack).toBeNull();
  });

  it("visual order preserved: source/filter controls, then the pin, then the rows", () => {
    const pin = q("[data-testid=batch-bulkbar-pin]")!;
    const controls = q(".v2-controls")!;
    const list = q(".batch-list")!;
    expect((controls.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((pin.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });
});
