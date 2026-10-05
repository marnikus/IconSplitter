// folderbar.test.tsx — RULE 8/10/12: ONE folder control for every tab (I-44),
// and its read-only path row (I-46). The button says "Open folder" in every
// state, carries the green class whose hover/active/focus states live in the
// stylesheet, and the row below it is plain text: the complete captured path
// when there is one, the folder's name plus an honest note when there is not,
// and never an input. Nothing here re-implements a component — it drives the
// shared one the three toolbars mount.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveRootPathInfo } from "../src/lib/rootpath";
import { FolderPathRow, OpenFolderButton } from "../src/ui/FolderBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "split_root";
const FULL = "F:\\Stocks 2026\\icons\\split_root";

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

let host: HTMLDivElement;
let ui: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  if (ui !== null) await act(async () => { ui?.unmount(); });
  ui = null;
  host.remove();
});

async function mount(node: ReactNode): Promise<void> {
  await act(async () => {
    ui = createRoot(host);
    ui.render(<>{node}</>);
  });
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";

describe("OpenFolderButton — the one folder control", () => {
  it("says \"Open folder\" in every state, is green, and reports its click", async () => {
    const onClick = vi.fn();
    await mount(<OpenFolderButton testid="x-open-folder" onClick={onClick} />);
    const btn = q("[data-testid=x-open-folder]") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.type).toBe("button"); // never a form submit
    expect(btn.textContent).toBe("Open folder");
    expect(btn.className).toContain("folder-open");
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onClick).toHaveBeenCalledTimes(1);
    // no other control in the bar may claim the picker's job
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });

  it("is styled as a green button with hover, active and keyboard-focus states", () => {
    const sheet = css();
    expect(sheet).toMatch(/\.folder-open\s*\{/);
    expect(sheet).toMatch(/\.folder-open:hover\s*\{/);
    expect(sheet).toMatch(/\.folder-open:active\s*\{/);
    expect(sheet).toMatch(/\.folder-open:focus-visible\s*\{/);
  });
});

describe("FolderPathRow — the full path, in one full-width read-only row", () => {
  it("shows the captured path as text, word for word, with nothing to click or type", async () => {
    saveRootPathInfo(ROOT, `"${FULL}\\"`, "copied"); // Explorer's quotes and trailing slash
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    const row = q("[data-testid=x-folder-path]");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("folder-path");
    expect(row?.textContent).toContain(FULL);
    // read-only text: no input, no button, no link, no editable region
    expect(row?.querySelector("input, textarea, select, button, a, [contenteditable]")).toBeNull();
    expect(row?.getAttribute("title")).toContain(FULL); // long paths stay readable
  });

  it("names the folder and says when no full path was captured", async () => {
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).toContain(ROOT);
    expect(text("[data-testid=x-folder-path]")).toContain("full path not captured");
    expect(q("[data-testid=x-folder-path]")?.querySelector("input, button")).toBeNull();
  });

  it("flags a path completed from the copied parent folder", async () => {
    saveRootPathInfo(ROOT, FULL, "completed");
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).toContain(FULL);
    expect(text("[data-testid=x-folder-path]")).toContain("completed — check it");
  });

  it("renders nothing while no folder is loaded", async () => {
    await mount(<FolderPathRow rootName="" testid="x-folder-path" />);
    expect(q("[data-testid=x-folder-path]")).toBeNull();
    expect(host.textContent).toBe("");
  });

  it("follows the memory live: a capture in any tab appears without a reload (I-36/RULE 24)", async () => {
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).toContain("full path not captured");
    await act(async () => { saveRootPathInfo(ROOT, FULL, "copied"); });
    expect(text("[data-testid=x-folder-path]")).toContain(FULL);
    expect(text("[data-testid=x-folder-path]")).not.toContain("not captured");
  });
});

describe("the removed folder chrome stays removed", () => {
  it("has no path pill, no path field and no copied-path control left in the stylesheet", () => {
    const sheet = css();
    for (const gone of [".v2-path-pill", ".svg-path-pill", ".pathfield", "pathfield-use"]) {
      expect(sheet).not.toContain(gone);
    }
  });
});
