// getdata_ui.test.tsx — the shared "Get data" button and dialog (2026-11-10).
// Selecting rows enables the button; it opens a dialog with the four choices as
// checkboxes and a live preview of the list; Copy puts the list on the clipboard.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GetDataButton from "../src/ui/GetDataButton";
import { resetGetDataChoice } from "../src/ui/getdatachoice";
import type { DataRow } from "../src/lib/getdata";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS: DataRow[] = [
  { svg: { name: "fish.svg", path: "Sea/fish.svg" }, png: { name: "fish_AI.png", path: "Sea/fish_AI.png" }, status: ["generated", "approved"] },
  { svg: { name: "owl.svg", path: "Sky/owl.svg" }, png: { name: "owl_AI.png", path: "Sky/owl_AI.png" }, status: ["generated", "pending"] },
];

let host: HTMLDivElement;
let ui: Root;
let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
beforeEach(() => {
  resetGetDataChoice();
  writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
});
afterEach(() => { act(() => ui.unmount()); host.remove(); });
const q = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const mount = (count = 2, rows = () => ROWS) => act(async () => { ui.render(<GetDataButton testid="demo" count={count} rows={rows} />); });
const click = (sel: string) => act(async () => { q(sel)?.click(); });
const preview = () => (q("[data-testid=demo-get-data-preview]") as HTMLTextAreaElement).value;

describe("the button", () => {
  it("says Get data, and is off while no row is selected", async () => {
    await mount(0);
    expect(q("[data-testid=demo-get-data]")?.textContent).toContain("Get data");
    expect((q("[data-testid=demo-get-data]") as HTMLButtonElement).disabled).toBe(true);
    await mount(2);
    expect((q("[data-testid=demo-get-data]") as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens the dialog; reads the rows only when it is pressed", async () => {
    const rows = vi.fn(() => ROWS);
    await mount(2, rows);
    expect(rows).not.toHaveBeenCalled();
    expect(q("[data-testid=demo-get-data-dialog]")).toBeNull();
    await click("[data-testid=demo-get-data]");
    expect(rows).toHaveBeenCalledTimes(1);
    expect(q("[data-testid=demo-get-data-dialog]")).not.toBeNull();
  });
});

describe("the dialog", () => {
  it("offers the four choices as checkboxes: SVG name, PNG name, status, file path", async () => {
    await mount();
    await click("[data-testid=demo-get-data]");
    for (const f of ["svg", "png", "status", "path"]) {
      const box = q(`[data-testid=demo-get-data-field-${f}]`) as HTMLInputElement;
      expect(box.type).toBe("checkbox");
    }
    expect(q("[data-testid=demo-get-data-dialog]")?.textContent).toMatch(/2 selected/);
  });

  it("shows the list as the choices are ticked, and Copy puts exactly that on the clipboard", async () => {
    await mount();
    await click("[data-testid=demo-get-data]");
    expect(preview()).toBe("fish.svg, fish_AI.png\nowl.svg, owl_AI.png"); // names are ticked at first
    await click("[data-testid=demo-get-data-field-png]");
    expect(preview()).toBe("fish.svg, owl.svg");
    await click("[data-testid=demo-get-data-field-status]");
    await click("[data-testid=demo-get-data-field-path]");
    expect(preview()).toBe("fish.svg, generated · approved, Sea/fish.svg\nowl.svg, generated · pending, Sky/owl.svg");
    await click("[data-testid=demo-get-data-copy]");
    expect(writeText).toHaveBeenCalledWith(preview());
    expect(q("[data-testid=demo-get-data-copied]")?.textContent).toMatch(/Copied 2/);
  });

  it("with one choice the list is one line of comma-separated names", async () => {
    await mount();
    await click("[data-testid=demo-get-data]");
    await click("[data-testid=demo-get-data-field-png]");
    await click("[data-testid=demo-get-data-field-svg]");
    await click("[data-testid=demo-get-data-field-png]");
    expect(preview()).toBe("fish_AI.png, owl_AI.png");
  });

  it("Copy is off while nothing is ticked; the choice is remembered for the next time", async () => {
    await mount();
    await click("[data-testid=demo-get-data]");
    await click("[data-testid=demo-get-data-field-svg]");
    await click("[data-testid=demo-get-data-field-png]");
    expect((q("[data-testid=demo-get-data-copy]") as HTMLButtonElement).disabled).toBe(true);
    await click("[data-testid=demo-get-data-field-status]");
    await click("[data-testid=demo-get-data-close]");
    expect(q("[data-testid=demo-get-data-dialog]")).toBeNull();
    await click("[data-testid=demo-get-data]");
    expect((q("[data-testid=demo-get-data-field-status]") as HTMLInputElement).checked).toBe(true);
    expect((q("[data-testid=demo-get-data-field-svg]") as HTMLInputElement).checked).toBe(false);
  });

  it("a blocked clipboard says so instead of claiming it copied", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await mount();
    await click("[data-testid=demo-get-data]");
    await click("[data-testid=demo-get-data-copy]");
    expect(q("[data-testid=demo-get-data-copied]")).toBeNull();
    expect(q("[data-testid=demo-get-data-error]")?.textContent).toMatch(/could not copy/i);
  });

  it("Esc closes it", async () => {
    await mount();
    await click("[data-testid=demo-get-data]");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(q("[data-testid=demo-get-data-dialog]")).toBeNull();
  });
});
