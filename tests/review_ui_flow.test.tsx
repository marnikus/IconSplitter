// TDD cycle R8 (design rewrite) — the Selection tab as the user drives it:
// pick a folder, the recursive scan lists the pairs, a row opens the comparison
// card, A/D decide and roll over to the next pending pair, Space toggles the
// zoom, ⌘K reaches the search box and the decision lands in the JSON on disk.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import Workbench from "../src/ui/Workbench";
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
  const dir = new FakeDir("split_output");
  const cat = new FakeDir("campaigns");
  cat.children.set("fog.png", new FakeFile("fog.png", 4, 1000, "fog"));
  cat.children.set("fog_AI.png", new FakeFile("fog_AI.png", 4, 2000, "fog"));
  cat.children.set("moon.png", new FakeFile("moon.png", 4, 1000, "moon"));
  cat.children.set("moon_AI.png", new FakeFile("moon_AI.png", 4, 2000, "moon"));
  cat.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 4, 3000, "harbor"));
  dir.children.set("campaigns", cat);
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

function textOf(selector: string): string {
  return find(selector).textContent ?? "";
}

function storedDecision(dir: FakeDir, pairId: string): string | undefined {
  const parsed = parseReviewFile((dir.children.get(REVIEW_FILE) as FakeFile).text);
  return parsed.ok ? parsed.file.records.find((r) => r.pair_id === pairId)?.decision : undefined;
}

/** Types into a controlled input the way React sees it (native value setter). */
async function type(text: string): Promise<void> {
  const input = find('[data-testid="review-search"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

async function press(key: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  await flush();
}

/** Renders the real shell and switches to the Selection tab, like a user does. */
async function openPanel(): Promise<void> {
  await act(async () => { root.render(<Workbench />); });
  await act(async () => { find('[data-testid="tab-review"]').click(); });
  await act(async () => { find('[data-testid="review-root"]').click(); });
  await flush();
  expect(textOf('[data-testid="review-showing"]')).toContain("3 pairs");
}

describe("Selection tab — interactive review flow (spec §1, §2, §5, §6, §8, design)", () => {
  it("scans recursively, lists the pairs and reports the recursive index", async () => {
    tree();
    await openPanel();
    expect(textOf('[data-testid="review-recursive"]')).toContain("Recursive · 1 nested folder");
    expect(container.querySelectorAll('[data-testid^="review-row-"]')).toHaveLength(3);
    expect(container.innerHTML).toContain("harbor_AI.png");
    expect(textOf('[data-testid="status-index"]')).toContain("Recursive index ready");
    expect(textOf('[data-testid="status-progress"]')).toContain("0 / 3 reviewed");
  });

  it("opens a pair, approves it with A and rolls on to the next pending image", async () => {
    const dir = tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-campaigns/moon"]').click(); });
    expect(textOf('[data-testid="detail-name"]')).toContain("moon_AI.png");
    expect(textOf('[data-testid="compare-view"]')).toContain("Original");
    expect(textOf('[data-testid="compare-view"]')).toContain("AI result");

    await press("a");

    expect(storedDecision(dir, "campaigns/moon")).toBe("approved");
    expect(storedDecision(dir, "campaigns/fog")).toBe("pending");
    expect(textOf('[data-testid="detail-name"]')).toContain("fog_AI.png"); // rolled over
    expect(textOf('[data-testid="status-progress"]')).toContain("1 / 3 reviewed");
  });

  it("declines with D, badges the row and updates the counters", async () => {
    const dir = tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-campaigns/fog"]').click(); });
    await press("d");

    expect(storedDecision(dir, "campaigns/fog")).toBe("declined");
    expect(textOf('[data-testid="review-row-campaigns/fog"]')).toContain("Declined");
    expect(textOf('[data-testid="count-declined"]')).toBe("1");
  });

  it("changes a previous decision by clicking the other button", async () => {
    const dir = tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-campaigns/fog"]').click(); });
    await act(async () => { find('[data-testid="review-approve"]').click(); });
    await flush();
    expect(storedDecision(dir, "campaigns/fog")).toBe("approved");

    await act(async () => { find('[data-testid="review-row-campaigns/fog"]').click(); });
    await act(async () => { find('[data-testid="review-decline"]').click(); });
    await flush();
    expect(storedDecision(dir, "campaigns/fog")).toBe("declined");
    expect(textOf('[data-testid="count-approved"]')).toBe("0");
  });

  it("toggles fit / 100 % zoom with Space and shows it on the badge", async () => {
    tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-campaigns/fog"]').click(); });
    expect(textOf('[data-testid="zoom-badge"]')).toContain("FIT SYNC");
    await press(" ");
    expect(textOf('[data-testid="zoom-badge"]')).toContain("1:1 SYNC");
    await press(" ");
    expect(textOf('[data-testid="zoom-badge"]')).toContain("FIT SYNC");
  });

  it("navigates with the arrow keys and switches the watcher off", async () => {
    tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-campaigns/fog"]').click(); });
    await press("ArrowDown");
    expect(textOf('[data-testid="detail-name"]')).toContain("moon_AI.png");
    await press("ArrowUp");
    expect(textOf('[data-testid="detail-name"]')).toContain("fog_AI.png");

    await act(async () => { find('[data-testid="watcher-pill"]').click(); });
    expect(textOf('[data-testid="watcher-pill"]')).toContain("Watcher paused");
    expect(textOf('[data-testid="status-index"]')).toContain("Watcher paused");
  });

  it("filters from the search box, keeps the JSON decisions on a rescan and reports the delta", async () => {
    const dir = tree();
    await openPanel();
    await act(async () => { find('[data-testid="review-row-campaigns/fog"]').click(); });
    await act(async () => { find('[data-testid="review-approve"]').click(); });
    await flush();

    await type("moon");
    expect(container.querySelectorAll('[data-testid^="review-row-"]')).toHaveLength(1);
    expect(container.innerHTML).toContain("moon_AI.png");
    expect(container.innerHTML).not.toContain("fog_AI.png");
    await type("nothing-matches");
    expect(textOf('[data-testid="review-empty"]')).toContain("Nothing matches");
    await type("");

    await act(async () => { find('[data-testid="review-refresh"]').click(); });
    await flush();
    expect(storedDecision(dir, "campaigns/fog")).toBe("approved");
    expect(textOf('[data-testid="review-row-campaigns/fog"]')).toContain("Approved");
    expect(textOf('[data-testid="status-delta"]')).toContain("+0 new");
  });

  it("reports added pairs in the rescan delta", async () => {
    const dir = tree();
    await openPanel();
    const cat = dir.children.get("campaigns") as FakeDir;
    cat.children.set("dune.png", new FakeFile("dune.png", 4, 4000, "dune"));
    cat.children.set("dune_AI.png", new FakeFile("dune_AI.png", 4, 4000, "dune"));
    await act(async () => { find('[data-testid="review-refresh"]').click(); });
    await flush();
    expect(textOf('[data-testid="status-delta"]')).toContain("+1 new");
    expect(textOf('[data-testid="review-showing"]')).toContain("4 pairs");
    expect(textOf('[data-testid="review-row-campaigns/dune"]')).toContain("Pending");
  });

  it("flags the unpaired AI result as the one needing attention", async () => {
    tree();
    await openPanel();
    expect(textOf('[data-testid="review-attention"]')).toContain("1 need attention");
    expect(textOf('[data-testid="review-row-campaigns/harbor"]')).toContain("Original missing");
  });
});
