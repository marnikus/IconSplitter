// TDD cycle R8 — the Selection tab as the user drives it: pick a folder, the
// recursive scan lists the pairs, a row opens the comparison window, A/D decide
// and roll over to the next pending pair, and the decision lands in the JSON.
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import ReviewPanel from "../src/review/ReviewPanel";
import { parseReviewFile } from "../src/lib/reviewfile";
import { REVIEW_FILE } from "../src/lib/reviewio";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  void act(() => root.unmount());
  container.remove();
});

function tree(): FakeDir {
  const dir = new FakeDir("icons");
  const cat = new FakeDir("cat");
  cat.children.set("star.png", new FakeFile("star.png", 4, 1000, "star"));
  cat.children.set("star_AI.png", new FakeFile("star_AI.png", 4, 2000, "star"));
  cat.children.set("moon.png", new FakeFile("moon.png", 4, 1000, "moon"));
  cat.children.set("moon_AI.png", new FakeFile("moon_AI.png", 4, 2000, "moon"));
  dir.children.set("cat", cat);
  (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => dir;
  return dir;
}

async function flush(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function find(selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing element: ${selector} in ${container.innerHTML.slice(0, 400)}`);
  return el;
}

function storedDecision(dir: FakeDir, pairId: string): string | undefined {
  const parsed = parseReviewFile((dir.children.get(REVIEW_FILE) as FakeFile).text);
  return parsed.ok ? parsed.file.records.find((r) => r.pair_id === pairId)?.decision : undefined;
}

async function openPanel(): Promise<void> {
  await act(async () => { root.render(<ReviewPanel />); });
  await act(async () => { find('[data-testid="review-root"]').click(); });
  await flush();
  expect(container.textContent).toContain("2 pairs");
}

describe("Selection tab — interactive review flow (spec §1, §2, §5, §6, §8)", () => {
  it("scans recursively, reviews a pair and approves it with the A key", async () => {
    const dir = tree();
    await openPanel();
    expect(container.textContent).toContain("star_AI.png");
    expect(container.textContent).toContain("moon_AI.png");

    await act(async () => { find('[data-testid="review-row-cat/moon"]').click(); });
    expect(find('[data-testid="compare-view"]')).toBeTruthy();

    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
    await flush();

    expect(storedDecision(dir, "cat/moon")).toBe("approved");
    expect(storedDecision(dir, "cat/star")).toBe("pending");
    // the window rolled over to the remaining pending pair
    expect(find('[data-testid="compare-view"]').textContent).toContain("star_AI.png");
  });

  it("declines with the D key and reflects it in the row, counters and JSON", async () => {
    const dir = tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-cat/star"]').click(); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" })); });
    await flush();

    expect(storedDecision(dir, "cat/star")).toBe("declined");
    expect(find('[data-testid="review-row-cat/star"]').textContent).toContain("Declined");
    expect(find('[data-testid="counter-declined"] b').textContent).toBe("1");
  });

  it("changes a previous decision by clicking the other button", async () => {
    const dir = tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-cat/star"]').click(); });
    await act(async () => { find('[data-testid="review-approve"]').click(); });
    await flush();
    expect(storedDecision(dir, "cat/star")).toBe("approved");

    await act(async () => { find('[data-testid="review-row-cat/star"]').click(); });
    await act(async () => { find('[data-testid="review-decline"]').click(); });
    await flush();
    expect(storedDecision(dir, "cat/star")).toBe("declined");
    expect(find('[data-testid="counter-declined"] b').textContent).toBe("1");
    expect(find('[data-testid="counter-approved"] b').textContent).toBe("0");
  });

  it("keeps decisions when the folder is scanned again", async () => {
    tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-cat/star"]').click(); });
    await act(async () => { find('[data-testid="review-approve"]').click(); });
    await flush();

    await act(async () => { find('[data-testid="review-refresh"]').click(); });
    await flush();
    expect(find('[data-testid="review-row-cat/star"]').textContent).toContain("Approved");
  });
});
