// folderbar.test.tsx — RULE 8: the shared folder control of Selection V2 and
// Generate SVG. The button is the ONLY action; the path is a statement, shown
// as read-only text in its own full-width row. Both halves are driven for real
// (real components, real DOM), and the stylesheet is read where the acceptance
// asks for visible states rather than for a class name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenFolderButton, RootPathRow } from "../src/ui/FolderBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FULL = "F:\\Stocks 2026\\icons testing\\split_root";

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** One rule's declarations, so a state is asserted on the rule that owns it. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css().match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function render(node: ReactElement): void {
  act(() => ui.render(node));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
});

describe("OpenFolderButton — the one way to open a folder", () => {
  it("is a real button labelled \"Open folder\" that fires its handler", () => {
    const onClick = vi.fn();
    render(<OpenFolderButton testid="v2-open-folder" onClick={onClick} />);
    const btn = q("[data-testid='v2-open-folder']") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.type).toBe("button"); // never a submit inside a form
    expect(btn.textContent).toBe("Open folder");
    expect(btn.disabled).toBe(false);
    act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("carries the green style, with hover, active and keyboard-focus states", () => {
    render(<OpenFolderButton testid="svg-open-folder" onClick={() => undefined} />);
    expect(q("[data-testid='svg-open-folder']")?.className).toContain("folder-open");
    const base = rule(".folder-open");
    expect(base).toMatch(/background:\s*#/); // a filled button, not a ghost
    expect(base).toMatch(/cursor:\s*pointer/);
    expect(rule(".folder-open:hover")).toMatch(/background:/);
    expect(rule(".folder-open:active")).toMatch(/background:/);
    expect(rule(".folder-open:focus-visible")).toMatch(/outline:/);
  });
});

describe("RootPathRow — the picked full path, read-only (I-36)", () => {
  it("shows the complete path as text, with nothing to type or press", () => {
    render(<RootPathRow testid="svg-root-path" rootName="split_root" path={FULL} />);
    const row = q("[data-testid='svg-root-path']")!;
    expect(row.textContent).toBe(FULL);
    expect(row.getAttribute("title")).toBe(FULL); // the whole path on hover
    // the request was explicit: read-only text, never a copy/paste field
    expect(row.querySelector("input")).toBeNull();
    expect(row.querySelector("textarea")).toBeNull();
    expect(row.querySelector("button")).toBeNull();
  });

  it("renders nothing before a folder is chosen — there is no path to report", () => {
    render(<RootPathRow testid="v2-root-path" rootName="" path="" />);
    expect(q("[data-testid='v2-root-path']")).toBeNull();
  });

  it("explains WHY the path is missing once a folder is open, still with nothing to press", () => {
    // the reported bug: the folder was chosen and the row said nothing at all
    render(<RootPathRow testid="v2-root-path" rootName="split_root" path="" />);
    const row = q("[data-testid='v2-root-path']")!;
    expect(row.tagName).toBe("P");
    expect(row.textContent).toContain("Full path unknown");
    expect(row.textContent).toContain("copy the folder in Explorer");
    expect(row.textContent).toContain("Open folder");
    expect(row.querySelector("input, textarea, button, a")).toBeNull();
    expect(row.className).toContain("unknown");
  });

  it("replaces the hint with the path the moment a pick captures one (RULE 24)", () => {
    render(<RootPathRow testid="v2-root-path" rootName="split_root" path="" />);
    expect(q("[data-testid='v2-root-path']")?.textContent).toContain("Full path unknown");
    render(<RootPathRow testid="v2-root-path" rootName="split_root" path={FULL} />);
    const row = q("[data-testid='v2-root-path']")!;
    expect(row.textContent).toBe(FULL);
    expect(row.className).not.toContain("unknown");
  });

  it("wraps a long path instead of hiding it behind an ellipsis", () => {
    expect(rule(".folder-path")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".folder-path")).toMatch(/width:\s*100%/);
    expect(rule(".folder-path.unknown")).toMatch(/color:/); // quiet, but readable
  });
});
