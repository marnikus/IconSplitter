import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHandles } from "../src/batch/store";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { sidecarFixture, sourceRowFixture } from "./helpers/svgfixtures";
import { loadSidecar, sidecarName } from "../src/svg/sidecar";
import { HistoryProvider, useHistory } from "../src/state/HistoryProvider";
import { useSvgReview } from "../src/svg/ui/useSvgReview";
import type { DirHandleLike } from "../src/lib/fs";
import type { SvgSourceRow } from "../src/svg/types";

vi.mock("../src/batch/store", () => ({ loadHandles: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
let root: FakeDir;

function Harness({ folder, row }: { folder: DirHandleLike; row: SvgSourceRow }) {
  const { review } = useSvgReview();
  const history = useHistory();
  return <div>
    <button data-testid="approve" onClick={() => void review(folder, [row], "approved")}>Approve SVG</button>
    <button data-testid="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
    <button data-testid="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
    <span data-testid="cursor">{history.index}</span><span data-testid="label">{history.undoLabel ?? "none"}</span>
    {history.error && <span data-testid="error">{history.error}</span>}
  </div>;
}

function mount(folder: FakeDir): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => ui.render(<HistoryProvider><Harness folder={folder} row={sourceRowFixture()} /></HistoryProvider>));
}

const query = (selector: string) => host.querySelector(selector) as HTMLElement | null;
async function click(selector: string): Promise<void> {
  await act(async () => {
    query(selector)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function storedReview(): Promise<string | undefined> {
  const loaded = await loadSidecar(root, sidecarFixture().sourceId, sidecarFixture().sourcePath);
  return loaded.state === "ok" ? loaded.value.versions[0].review : undefined;
}

beforeEach(() => {
  localStorage.clear();
  root = new FakeDir("root");
  const folder = new FakeDir("folder");
  root.children.set("folder", folder);
  const value = sidecarFixture();
  folder.children.set(sidecarName(value.sourcePath), new FakeFile(sidecarName(value.sourcePath), 200, 1, JSON.stringify(value)));
  vi.mocked(loadHandles).mockResolvedValue({ source: root });
  mount(root);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("SVG review and the single global undo timeline", () => {
  it("records one version decision and Ctrl+Z / Ctrl+Shift+Z undo and redo its sidecar", async () => {
    await click("[data-testid='approve']");
    expect(await storedReview()).toBe("approved");
    expect(query("[data-testid='cursor']")?.textContent).toBe("0");
    expect(query("[data-testid='label']")?.textContent).toContain("Approve 1 SVG version");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await storedReview()).toBe("pending");
    expect(query("[data-testid='cursor']")?.textContent).toBe("-1");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await storedReview()).toBe("approved");
    expect(query("[data-testid='cursor']")?.textContent).toBe("0");
  });

  it("leaves the global history cursor unchanged when the target version cannot be applied", async () => {
    await click("[data-testid='approve']");
    const folder = root.children.get("folder") as FakeDir;
    const name = sidecarName(sidecarFixture().sourcePath);
    const original = JSON.stringify(sidecarFixture());
    folder.children.set(name, new FakeFile(name, 10, 1, "corrupt"));
    await click("[data-testid='undo']");
    expect(query("[data-testid='cursor']")?.textContent).toBe("0");
    expect(query("[data-testid='error']")?.textContent).toContain("could not be reversed");

    folder.children.set(name, new FakeFile(name, 200, 1, original));
    await click("[data-testid='undo']");
    expect(query("[data-testid='cursor']")?.textContent).toBe("-1");
    expect(query("[data-testid='error']")).toBeNull();
  });
});
