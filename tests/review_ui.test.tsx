// TDD cycle R6 — review UI: status text + icons (never colour alone), the
// comparison window content, the list rows and the keyboard map (spec §5, §11).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CompareView, { type CompareActions, type CompareProps } from "../src/review/CompareView";
import ReviewCounters from "../src/review/ReviewCounters";
import ReviewList from "../src/review/ReviewList";
import StatusBadge from "../src/review/StatusBadge";
import ReviewPanel from "../src/review/ReviewPanel";
import Workbench from "../src/ui/Workbench";
import { hotkeyAction } from "../src/lib/reviewkeys";
import type { Thumbs } from "../src/ui/useThumbnails";
import type { Decision } from "../src/lib/reviewfile";
import { item } from "./helpers/review";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const buttonTag = (html: string, testid: string) =>
  html.match(new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";

const thumbs = (url: string | null = null, failed = false): Thumbs => ({
  urlFor: () => url, errorFor: () => failed, request: () => {}, clear: () => {},
});

const actions: CompareActions = {
  decide: () => {}, close: () => {}, prev: () => {}, next: () => {}, openPath: () => {},
};

function compareProps(patch: Partial<CompareProps> = {}): CompareProps {
  return {
    item: item("cat/star", "pending", { mtime: at(2026, 10, 1) }),
    position: { index: 1, total: 3, root: "MyIcons" },
    sides: {
      source: {
        url: "blob:source",
        error: null,
        info: { relPath: "cat/star.png", width: 512, height: 512, size: 2048, format: "PNG" },
      },
      ai: {
        url: "blob:ai",
        error: null,
        info: { relPath: "cat/star_AI.png", width: 256, height: 256, size: 4096, format: "PNG" },
      },
      busy: false,
    },
    actions,
    ...patch,
  };
}

describe("StatusBadge — text + icon, never colour alone (spec §11)", () => {
  const markup = (status: Decision) => renderToStaticMarkup(<StatusBadge status={status} />);

  it("labels approved, declined and pending with distinct text and icons", () => {
    expect(markup("approved")).toContain("✓");
    expect(markup("approved")).toContain("Approved");
    expect(markup("declined")).toContain("✕");
    expect(markup("declined")).toContain("Declined");
    expect(markup("pending")).toContain("○");
    expect(markup("pending")).toContain("Pending");
    expect(markup("approved")).not.toContain("Declined");
  });

  it("exposes the status to assistive technology", () => {
    expect(markup("approved")).toContain('aria-label="Review status: Approved"');
    expect(markup("declined")).toContain('data-status="declined"');
  });
});

describe("CompareView — side by side comparison window (spec §5)", () => {
  it("labels both sides and shows dimensions, format, size and path", () => {
    const html = renderToStaticMarkup(<CompareView {...compareProps()} />);
    expect(html).toContain("Original");
    expect(html).toContain("AI result");
    expect(html).toContain("512 × 512");
    expect(html).toContain("256 × 256");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("4.0 KB");
    expect(html).toContain("PNG");
    expect(html).toContain("cat/star.png");
    expect(html).toContain("cat/star_AI.png");
    expect(html).toContain("1 / 3");
  });

  it("offers Approve and Decline plus Open in File Explorer for both files", () => {
    const html = renderToStaticMarkup(<CompareView {...compareProps()} />);
    expect(html).toContain("Approve");
    expect(html).toContain("Decline");
    expect(count(html, "Open in File Explorer")).toBe(2);
    expect(html).toContain("A approve");
    expect(html).toContain("D decline");
  });

  it("marks the current decision on the matching button (changing a decision is allowed)", () => {
    const approved = renderToStaticMarkup(<CompareView {...compareProps({ item: item("cat/star", "approved") })} />);
    expect(buttonTag(approved, "review-approve")).toContain('aria-pressed="true"');
    expect(buttonTag(approved, "review-decline")).toContain('aria-pressed="false"');
    const declined = renderToStaticMarkup(<CompareView {...compareProps({ item: item("cat/star", "declined") })} />);
    expect(buttonTag(declined, "review-decline")).toContain('aria-pressed="true"');
  });

  it("keeps large, aspect-preserving preview panes (object-contain, fixed height)", () => {
    const html = renderToStaticMarkup(<CompareView {...compareProps()} />);
    expect(count(html, "object-contain")).toBe(2);
    expect(html).toContain("h-72");
  });

  it("reports a missing side honestly instead of an empty pane (spec §10)", () => {
    const noAi = renderToStaticMarkup(<CompareView {...compareProps({
      item: item("solo", "pending", { ai: false }),
      sides: { source: null, ai: null, busy: false },
    })} />);
    expect(noAi).toContain("AI result missing");
    const noSource = renderToStaticMarkup(<CompareView {...compareProps({
      item: item("only", "pending", { source: false }),
      sides: { source: null, ai: null, busy: false },
    })} />);
    expect(noSource).toContain("Original missing");
  });

  it("shows the thumbnail failure as text, not a broken image", () => {
    const html = renderToStaticMarkup(<CompareView {...compareProps({
      sides: {
        source: { url: null, error: "Could not read image", info: null },
        ai: null,
        busy: false,
      },
    })} />);
    expect(html).toContain("Could not read image");
    expect(html).toContain("AI result missing");
  });

  it("is an accessible dialog with a labelled close control", () => {
    const html = renderToStaticMarkup(<CompareView {...compareProps()} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Close comparison"');
  });
});

describe("ReviewList — review rows (spec §2)", () => {
  const listProps = {
    items: [item("cat/star", "approved", { mtime: at(2026, 10, 1) }), item("solo", "pending", { ai: false, mtime: at(2026, 9, 3) })],
    emptyNote: "No images found in this folder.",
    selection: { id: "cat/star", thumbs: thumbs("blob:x") },
    onOpen: () => {},
  };

  it("shows thumbnail, filename, relative folder, creation date and status", () => {
    const html = renderToStaticMarkup(<ReviewList {...listProps} />);
    expect(html).toContain("star_AI.png");
    expect(html).toContain("cat");
    expect(html).toContain("2026-10-01 12:00");
    expect(html).toContain("Approved");
    expect(html).toContain('data-testid="review-row-cat/star"');
    expect(html).toContain("blob:x");
  });

  it("warns about an unpaired source and keeps the row when the thumbnail fails", () => {
    const html = renderToStaticMarkup(<ReviewList {...listProps} selection={{ id: null, thumbs: thumbs(null, true) }} />);
    expect(html).toContain("AI result missing");
    expect(html).toContain("Preview unavailable");
    expect(count(html, "data-testid=\"review-row-")).toBe(2);
  });

  it("shows the empty note when nothing matches", () => {
    const html = renderToStaticMarkup(<ReviewList {...listProps} items={[]} />);
    expect(html).toContain("No images found in this folder.");
  });

  it("renders rows as buttons so they are keyboard reachable", () => {
    const html = renderToStaticMarkup(<ReviewList {...listProps} />);
    expect(count(html, 'type="button"')).toBe(2);
    expect(html).toContain('aria-current="true"');
  });
});

describe("ReviewCounters — totals double as the status filter (spec §2, §3)", () => {
  it("shows every counter as text and marks the active one", () => {
    const html = renderToStaticMarkup(
      <ReviewCounters counts={{ total: 4, pending: 1, approved: 2, declined: 1 }} active="approved" onPick={() => {}} />,
    );
    expect(html).toContain("Total");
    expect(html).toContain("Pending");
    expect(html).toContain("Approved");
    expect(html).toContain("Declined");
    expect(html).toContain('aria-pressed="true"');
    expect(count(html, "<button")).toBe(4);
  });
});

describe("hotkey map (spec §5 — A/D quick decisions)", () => {
  it("maps A, D, arrows and Escape when focus is not in a text field", () => {
    expect(hotkeyAction("a", "DIV")).toBe("approve");
    expect(hotkeyAction("A", "DIV")).toBe("approve");
    expect(hotkeyAction("d", "BODY")).toBe("decline");
    expect(hotkeyAction("ArrowRight", "BODY")).toBe("next");
    expect(hotkeyAction("ArrowLeft", "BODY")).toBe("prev");
    expect(hotkeyAction("Escape", "BODY")).toBe("close");
    expect(hotkeyAction("q", "BODY")).toBeNull();
  });

  it("never steals keys from inputs, selects or textareas", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(hotkeyAction("a", tag)).toBeNull();
      expect(hotkeyAction("d", tag)).toBeNull();
      expect(hotkeyAction("Escape", tag)).toBeNull();
    }
  });
});

describe("Selection tab wiring (spec §12 — appears after Batch folders)", () => {
  it("places the Selection tab directly after Batch folders", () => {
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('data-testid="tab-review"');
    expect(html).toContain('data-testid="tab-batch"');
    expect(html.indexOf("Batch folders")).toBeGreaterThan(-1);
    expect(html.indexOf("Batch folders")).toBeLessThan(html.indexOf("Selection"));
  });

  it("renders the review panel with its empty state instead of crashing", () => {
    const html = renderToStaticMarkup(<ReviewPanel />);
    expect(html).toContain("Choose split root…");
    expect(html).toContain("Rescan");
    expect(html).toContain("Total");
    expect(html).toContain("Clear filters");
    expect(html).toContain("No images found in this folder");
  });
});
