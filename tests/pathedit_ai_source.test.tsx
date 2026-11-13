// pathedit_ai_source.test.tsx — the edit mode shows the row's AI source next to
// the artboard (2026-11-06): a small "AI SOURCE" panel on the left — the same
// main image the row shows — so the vector can be compared with what it was
// drawn from while editing.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";
import AiSourcePanel from "../src/svg/pathedit/AiSourcePanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); });
const q = (sel: string) => host.querySelector(sel);

describe("the AI source panel", () => {
  it("shows the image under an AI SOURCE tag", async () => {
    await act(async () => { ui.render(<AiSourcePanel url="blob:ai" name="fog_AI.png" testid="a" />); });
    expect(q("[data-testid=a]")?.textContent).toContain("AI SOURCE");
    const img = q("[data-testid=a-img]") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:ai");
    expect(img.getAttribute("alt")).toBe("fog_AI.png");
  });

  it("says so when the image cannot be read", async () => {
    await act(async () => { ui.render(<AiSourcePanel url={null} name="fog_AI.png" testid="a" />); });
    expect(q("[data-testid=a]")?.textContent).toContain("Unreadable");
  });
});

describe("in the edit mode", () => {
  it("sits to the left of the artboard, outside it", async () => {
    await act(async () => {
      ui.render(<SvgPathEditor source={'<svg viewBox="0 0 24 24"><path d="M2 2L12 2"/></svg>'} box={{ width: 200, height: 200 }}
        testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} aside={<AiSourcePanel url="blob:ai" name="x" testid="ai" />} />);
    });
    const stage = q(".svg-edit-stage") as HTMLElement;
    const aside = q("[data-testid=ai]") as HTMLElement;
    const board = q(".svg-edit-board") as HTMLElement;
    expect(stage.contains(aside)).toBe(true);
    expect(board.contains(aside)).toBe(false);
    expect(aside.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the modal passes the row's main AI image", () => {
    const src = readFileSync("src/svg/pathedit/SvgEditModal.tsx", "utf8");
    expect(src).toContain("mainImageOf(");
    expect(src).toContain("<AiSourcePanel");
  });
});
