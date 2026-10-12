// batch_review_ui.test.tsx — the split-review controls lock their visual
// contract: badge glyph+label per value (never colour alone), row side-line
// classes, per-row decide buttons, bulk buttons and the gated split button.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import ScanTable from "../src/batch/ScanTable";
import BatchBulkBar from "../src/batch/BatchBulkBar";
import type { Row } from "../src/batch/useBatchTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

async function mountReact(el: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(el); });
}

function row(over: Partial<Row>): Row {
  return {
    relPath: "a/icon-a_AI_1.png", name: "icon-a_AI_1.png", dirPath: "a", relDir: "a",
    mtime: 1000, size: 10, status: "unprocessed", review: "pending", selected: false,
    refRelPath: "a/icon-a_1.png", ai: { base: "icon-a", tail: "" },
    ...over,
  } as Row;
}

const baseTable = {
  thumb: 84, activeId: null, toggle: vi.fn(), selectRow: vi.fn(), selectActive: vi.fn(),
  copyPath: vi.fn(), thumbFor: async () => "",
};

describe("batch Review column", () => {
  it("badges carry glyph + label; rows take their review side-line class", async () => {
    const rows = [
      row({ relPath: "p_AI.png", name: "p_AI.png", review: "pending" }),
      row({ relPath: "ok_AI.png", name: "ok_AI.png", review: "approved" }),
      row({ relPath: "no_AI.png", name: "no_AI.png", review: "declined" }),
    ];
    await mountReact(<ScanTable {...baseTable} rows={rows} />);
    expect(q("[data-testid='batch-review-badge-p_AI.png']")?.textContent).toMatch(/◔ Pending/);
    expect(q("[data-testid='batch-review-badge-ok_AI.png']")?.textContent).toMatch(/✓ Approved/);
    expect(q("[data-testid='batch-review-badge-no_AI.png']")?.textContent).toMatch(/✕ Declined/);
    // the row class is what turns the shared CSS side lines green/red
    expect(q("[data-testid='batch-row-ok_AI.png']")?.className).toMatch(/approved/);
    expect(q("[data-testid='batch-row-no_AI.png']")?.className).toMatch(/declined/);
    expect(q("[data-testid=batch-approved-count]")?.textContent).toBe("1 approved");
    expect(q("[data-testid=batch-declined-count]")?.textContent).toBe("1 declined");
  });

  it("row buttons decide; missing rows are not decidable", async () => {
    const onDecide = vi.fn();
    const rows = [row({ relPath: "p_AI.png", name: "p_AI.png" }), row({ relPath: "gone_AI.png", name: "gone_AI.png", status: "deleted" as Row["status"] })];
    await mountReact(<ScanTable {...baseTable} rows={rows} onDecide={onDecide} />);
    await act(async () => { (q("[data-testid='batch-review-approve-p_AI.png']") as HTMLButtonElement).click(); });
    expect(onDecide).toHaveBeenCalledWith("p_AI.png", "approved");
    await act(async () => { (q("[data-testid='batch-review-decline-p_AI.png']") as HTMLButtonElement).click(); });
    expect(onDecide).toHaveBeenCalledWith("p_AI.png", "declined");
    expect((q("[data-testid='batch-review-approve-gone_AI.png']") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("batch bulk review + gate", () => {
  const bar = {
    header: "some" as const, checkedCount: 2, visibleCount: 3, totalCount: 5, hiddenCount: 0,
    affectedCount: 2, thumb: 84, selectedCount: 2,
    onToggleAll: vi.fn(), onSelectVisible: vi.fn(), onDeselectAll: vi.fn(), onThumb: vi.fn(),
    onSplit: vi.fn(), onPreview: vi.fn(), canPreview: true, previewing: false,
  };

  it("bulk approve/decline act on the checked rows", async () => {
    const onDecide = vi.fn();
    await mountReact(<BatchBulkBar {...bar} approvedCheckedCount={2} canSplit onDecide={onDecide} />);
    await act(async () => { (q("[data-testid=batch-approve-selected]") as HTMLButtonElement).click(); });
    expect(onDecide).toHaveBeenCalledWith("approved");
    await act(async () => { (q("[data-testid=batch-decline-selected]") as HTMLButtonElement).click(); });
    expect(onDecide).toHaveBeenCalledWith("declined");
  });

  it("split approved (N): enabled only when an approved checked set exists", async () => {
    await mountReact(<BatchBulkBar {...bar} approvedCheckedCount={0} canSplit={false} />);
    const btn = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(btn.textContent).toMatch(/Split approved \(0\)/);
    expect(btn.disabled).toBe(true);
    await mountReact(<BatchBulkBar {...bar} approvedCheckedCount={2} canSplit />);
    const ready = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(ready.textContent).toMatch(/Split approved \(2\)/);
    expect(ready.disabled).toBe(false);
    // preview stays available while nothing is approved yet — it is what produces approvals
    expect((q("[data-testid=batch-preview]") as HTMLButtonElement).disabled).toBe(false);
  });
});
