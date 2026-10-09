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
import { saveRootPathInfo, ROOT_PATH_KEY } from "../src/lib/rootpath";
import type { DirHandleLike } from "../src/lib/fs";
import { clearKnownRoots, rememberKnownRoot } from "../src/ui/knownroots";
import { captureFromPaste } from "../src/ui/rootcapture";
import { FolderPathRow, OpenFolderButton } from "../src/ui/FolderBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = "split_root";
const FULL = "F:\\Stocks 2026\\icons\\split_root";
const rootHandle = { kind: "directory", name: ROOT } as DirHandleLike;

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

let host: HTMLDivElement;
let ui: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  clearKnownRoots();
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
    saveRootPathInfo(ROOT, `"${FULL}\\"`); // Explorer's quotes and trailing slash
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

  it("shows a stored `completed` guess (an older build's) as NOT captured — never the guess", async () => {
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: FULL, how: "completed" } }));
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).not.toContain(FULL);
    expect(text("[data-testid=x-folder-path]")).toContain("full path not captured");
  });

  it("renders nothing while no folder is loaded", async () => {
    await mount(<FolderPathRow rootName="" testid="x-folder-path" />);
    expect(q("[data-testid=x-folder-path]")).toBeNull();
    expect(host.textContent).toBe("");
  });

  it("follows the memory live: a capture in any tab appears without a reload (I-36/RULE 24)", async () => {
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).toContain("full path not captured");
    await act(async () => { saveRootPathInfo(ROOT, FULL); });
    expect(text("[data-testid=x-folder-path]")).toContain(FULL);
    expect(text("[data-testid=x-folder-path]")).not.toContain("not captured");
  });

  it("shows the active handle's path instead of a stale same-name path", async () => {
    const stale = "F:\\old-tree\\split_root";
    saveRootPathInfo(ROOT, stale);
    rememberKnownRoot(rootHandle, "");
    await mount(<FolderPathRow rootName={ROOT} rootHandle={rootHandle} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).not.toContain(stale);
    expect(text("[data-testid=x-folder-path]")).toContain("full path not captured");
    await act(async () => { await captureFromPaste(FULL, rootHandle); });
    expect(text("[data-testid=x-folder-path]")).toContain(FULL);
    expect(text("[data-testid=x-folder-path]")).not.toContain("not captured");
  });

  it("does not let a same-name handle's later capture relabel this handle's row", async () => {
    const otherPath = "D:\\backup\\split_root";
    const otherHandle = { kind: "directory", name: ROOT } as DirHandleLike;
    rememberKnownRoot(rootHandle, FULL);
    rememberKnownRoot(otherHandle, otherPath);
    saveRootPathInfo(ROOT, otherPath);
    await mount(<>
      <FolderPathRow rootName={ROOT} rootHandle={rootHandle} testid="first-path" />
      <FolderPathRow rootName={ROOT} rootHandle={otherHandle} testid="second-path" />
    </>);
    expect(text("[data-testid=first-path]")).toContain(FULL);
    expect(text("[data-testid=second-path]")).toContain(otherPath);
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

describe("FolderPathRow — the note says what to do (I-52)", () => {
  it("names the Explorer copy and the Rescan that captures it when there is no path", async () => {
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    const note = q("[data-testid=x-folder-path] em") as HTMLElement;
    expect(note.textContent).toContain("Ctrl+Shift+C");
    expect(note.textContent).toContain("Rescan");
    expect((q("[data-testid=x-folder-path]") as HTMLElement).title).toContain("Ctrl+Shift+C");
  });

  it("keeps the plain note when a path IS known", async () => {
    saveRootPathInfo(ROOT, FULL);
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(text("[data-testid=x-folder-path]")).toContain(FULL);
    expect(q("[data-testid=x-folder-path] em")?.textContent).toBe("");
    expect((q("[data-testid=x-folder-path]") as HTMLElement).title).toBe(FULL);
  });

  it("fills in from the user's own Ctrl+V, with no picker and no reload", async () => {
    await mount(<FolderPathRow rootName={ROOT} rootHandle={rootHandle} testid="x-folder-path" />);
    await act(async () => { pasteInto(document.body, `"${FULL}"`); });
    expect(text("[data-testid=x-folder-path]")).toContain(FULL);
    expect(text("[data-testid=x-folder-path]")).not.toContain("not captured");
  });

  it("adds no control — the bar is still one button and one line of text", async () => {
    await mount(<FolderPathRow rootName={ROOT} testid="x-folder-path" />);
    expect(host.querySelectorAll("button, input, textarea")).toHaveLength(0);
  });
});

/** One paste event, as the browser delivers it when the user presses Ctrl+V. */
function pasteInto(target: Element, text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  event.clipboardData = { getData: (type: string) => (type === "text/plain" ? text : "") };
  target.dispatchEvent(event);
}

