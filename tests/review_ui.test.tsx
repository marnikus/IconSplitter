// TDD cycle R6 (design rewrite) — review UI markup: status badges with icon +
// text, the comparison card, the list panel, the filter bar, the root bar, the
// status bar and the keyboard map (spec §2, §5, §7, §11; design screens).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DetailPane from "../src/review/DetailPane";
import FilterBar from "../src/review/FilterBar";
import PairList from "../src/review/PairList";
import RootBar from "../src/review/RootBar";
import StatusBadge, { IssueBadge } from "../src/review/StatusBadge";
import StatusBar from "../src/review/StatusBar";
import Warnings from "../src/review/Warnings";
import ReviewPanel from "../src/review/ReviewPanel";
import Workbench from "../src/ui/Workbench";
import { hotkeyAction } from "../src/lib/reviewkeys";
import { defaultQuery } from "../src/lib/reviewquery";
import type { ReviewApi } from "../src/review/api";
import type { Thumbs } from "../src/ui/useThumbnails";
import type { Decision, DecisionRecord } from "../src/lib/reviewfile";
import { item } from "./helpers/review";

const at = (y: number, m: number, d: number, h = 8, min = 32) => new Date(y, m - 1, d, h, min, 14).getTime();
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const buttonTag = (html: string, testid: string) => tag(html, "button", testid);
const inputTag = (html: string, testid: string) => tag(html, "input", testid);
const tag = (html: string, element: string, testid: string) =>
  html.match(new RegExp(`<${element}[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";

const PAIR = item("campaigns/october/coastal/fog_architecture_042", "pending", { mtime: at(2026, 10, 1) });

const thumbs = (url: string | null = null, failed = false): Thumbs => ({
  urlFor: () => url, errorFor: () => failed, request: () => {}, clear: () => {},
});

const api = (patch: Partial<ReviewApi["s"]> = {}): ReviewApi => ({
  s: {
    rootName: "split_output", items: [PAIR], orphans: [] as DecisionRecord[],
    counts: { total: 4, pending: 1, approved: 2, declined: 1 }, showing: 1, search: "",
    query: defaultQuery(), selectedId: null, busy: null, toast: null, fileStatus: "ok", fileNote: null,
    lastScanAt: at(2026, 10, 1, 8, 33), delta: { added: 3, renamed: 1, removed: 0, changed: 0, kept: 180 },
    folders: 16, unsaved: 1, watcher: true, zoom: "fit", autoNext: true, scanAt: 1, ...patch,
  },
  view: [PAIR],
  item: PAIR,
  detail: {
    sides: {
      source: { url: "blob:source", error: null, info: { relPath: PAIR.source!.relPath, width: 6240, height: 4160, size: 19_500_000, format: "PNG" } },
      ai: { url: "blob:ai", error: null, info: { relPath: PAIR.ai!.relPath, width: 4096, height: 2731, size: 12_800_000, format: "PNG" } },
    },
    busy: false,
  },
  thumbs: thumbs("blob:x"),
  supported: true,
  rescan: () => {}, pickRoot: () => {}, decide: () => {}, retry: () => {}, resetFile: () => {},
  openItem: () => {}, step: () => {}, patch: () => {}, clearFilters: () => {}, openPath: () => {},
  toggleWatcher: () => {}, toggleZoom: () => {}, setAutoNext: () => {},
});

describe("StatusBadge / IssueBadge — icon + text, never colour alone (spec §11)", () => {
  const markup = (status: Decision, long = false) => renderToStaticMarkup(<StatusBadge status={status} long={long} />);

  it("labels every state with text and exposes it to screen readers", () => {
    expect(markup("approved")).toContain("Approved");
    expect(markup("declined")).toContain("Declined");
    expect(markup("pending")).toContain("Pending");
    expect(markup("pending", true)).toContain("Pending review");
    expect(markup("approved")).toContain('aria-label="Review status: Approved"');
    expect(markup("declined")).toContain('data-status="declined"');
  });

  it("draws an icon for each state instead of relying on colour", () => {
    for (const status of ["pending", "approved", "declined"] as Decision[]) {
      expect(count(markup(status), "<path")).toBe(1);
    }
  });

  it("names the three file problems as text", () => {
    expect(renderToStaticMarkup(<IssueBadge issue="ai-missing" />)).toContain("AI result missing");
    expect(renderToStaticMarkup(<IssueBadge issue="source-missing" />)).toContain("Original missing");
    expect(renderToStaticMarkup(<IssueBadge issue="thumbnail-failed" />)).toContain("Thumbnail failed");
  });
});

describe("DetailPane — the comparison card (spec §5, §6, design)", () => {
  const html = (patch: Partial<ReviewApi["s"]> = {}, zoom: "fit" | "100" = "100") => {
    const r = api({ ...patch, zoom });
    return renderToStaticMarkup(
      <DetailPane item={r.item!} rootName={r.s.rootName} sides={{ ...r.detail.sides, busy: false }} zoom={zoom}
        autoNext={r.s.autoNext} decide={() => {}} setAutoNext={() => {}} openPath={() => {}} />,
    );
  };

  it("labels both sides and shows dimensions, format, size and the full path", () => {
    const markup = html();
    expect(markup).toContain("Original");
    expect(markup).toContain("AI result");
    expect(markup).toContain("6240 × 4160");
    expect(markup).toContain("4096 × 2731");
    expect(markup).toContain("18.6 MB");
    expect(markup).toContain("split_output\\campaigns\\october\\coastal\\fog_architecture_042.png");
    expect(count(markup, "Open in File Explorer")).toBe(2); // one per pane
  });

  it("shows the pair name, status and stable pair token", () => {
    const markup = html();
    expect(markup).toContain("fog_architecture_042_AI.png");
    expect(markup).toContain("Pending review");
    expect(markup).toMatch(/pair_[0-9a-f]{8}/);
    expect(markup).toContain("campaigns/october/coastal");
  });

  it("keeps the decisions above the AI result and marks the current one", () => {
    const pending = html();
    expect(buttonTag(pending, "review-approve")).toContain('aria-pressed="false"');
    const approved = html({}, "fit").replace("Pending review", "Approved");
    expect(approved).toBeTruthy();
    const declined = renderToStaticMarkup(
      <DetailPane item={{ ...PAIR, status: "declined" }} rootName="split_output" sides={{ source: null, ai: null, busy: false }}
        zoom="fit" autoNext decide={() => {}} setAutoNext={() => {}} openPath={() => {}} />,
    );
    expect(buttonTag(declined, "review-decline")).toContain('aria-pressed="true"');
  });

  it("reports a missing side, a failed preview and the zoom / roll-over controls", () => {
    const missing = renderToStaticMarkup(
      <DetailPane item={{ ...PAIR, ai: null, kind: "source-only" }} rootName="split_output"
        sides={{ source: { url: null, error: "Could not read image", info: null }, ai: null, busy: false }}
        zoom="fit" autoNext={false} decide={() => {}} setAutoNext={() => {}} openPath={() => {}} />,
    );
    expect(missing).toContain("AI result missing");
    expect(missing).toContain("Could not read image");
    expect(missing).toContain("FIT SYNC");
    expect(inputTag(missing, "next-pending")).not.toContain("checked");
  });

  it("switches the sync badge to 1:1 at 100 % zoom and explains the matching", () => {
    const markup = html();
    expect(markup).toContain("1:1 SYNC");
    expect(markup).toContain("Matched by suffix: _AI · source hierarchy preserved");
    expect(markup).toContain("Decisions persist by stable pair ID and timestamp");
    expect(markup).toContain("Created Oct 01, 2026 at 08:32:14");
    expect(markup).toContain("Generated Oct 01, 2026 at 08:32:14");
  });

  it("shows the keyboard legend", () => {
    const markup = html();
    for (const key of ["A", "D", "↑↓", "Space"]) expect(markup).toContain(`>${key}</kbd>`);
    expect(markup).toContain("Fit / 100%");
  });
});

describe("PairList — the review list panel (spec §2, design left column)", () => {
  const listProps = (patch: Partial<Parameters<typeof PairList>[0]> = {}) => ({
    items: [PAIR, item("solo", "approved", { ai: false, mtime: at(2026, 9, 30) })],
    total: 2, thumbs: thumbs("blob:x"), selectedId: "campaigns/october/coastal/fog_architecture_042",
    search: "", summary: "newest first · all decisions", attention: 1, emptyNote: "No matches.",
    canClear: true, collapsed: false,
    onSearch: () => {}, onOpen: () => {}, onToggleCollapse: () => {}, onClear: () => {}, ...patch,
  });

  it("shows the count, the search box, the summary and the attention figure", () => {
    const markup = renderToStaticMarkup(<PairList {...listProps()} />);
    expect(markup).toContain("IMAGE PAIRS");
    expect(markup).toContain("Search filename or folder…");
    expect(markup).toContain("⌘K");
    expect(markup).toContain("newest first · all decisions");
    expect(markup).toContain("1 need attention");
    expect(markup).toContain("No matches shows an empty state here");
  });

  it("shows thumbnail, name, folder, date and a badge per row", () => {
    const markup = renderToStaticMarkup(<PairList {...listProps()} />);
    expect(markup).toContain("fog_architecture_042_AI.png");
    expect(markup).toContain("campaigns/october/coastal");
    expect(markup).toContain("Oct 01 · 08:32");
    expect(markup).toContain("Pending");
    expect(markup).toContain('data-testid="issue-ai-missing"');
    expect(markup).toContain('data-testid="review-row-campaigns/october/coastal/fog_architecture_042"');
    expect(buttonTag(markup, "review-row-campaigns/october/coastal/fog_architecture_042")).toContain('aria-current="true"');
  });

  it("keeps the row when the thumbnail failed and badges it", () => {
    const markup = renderToStaticMarkup(<PairList {...listProps({ thumbs: thumbs(null, true) })} />);
    expect(count(markup, 'data-testid="review-row-')).toBe(2);
    expect(markup).toContain("Thumbnail failed");
  });

  it("collapses and shows the empty state", () => {
    const collapsed = renderToStaticMarkup(<PairList {...listProps({ collapsed: true })} />);
    expect(collapsed).not.toContain("Search filename");
    const empty = renderToStaticMarkup(<PairList {...listProps({ items: [] })} />);
    expect(empty).toContain("No matches.");
  });
});

describe("FilterBar — date, status, sort and order (spec §3, §4, design)", () => {
  const barProps = (patch: Partial<ReviewApi["s"]> = {}) => ({ r: api(patch), items: [PAIR], shown: 1 });

  it("offers all / month / custom with From and To controls", () => {
    const markup = renderToStaticMarkup(<FilterBar {...barProps()} />);
    expect(markup).toContain("DATE FILTER");
    expect(markup).toContain(">All</button>");
    expect(markup).toContain(">Month</button>");
    expect(markup).toContain(">Custom</button>");
    expect(markup).toContain('data-testid="filter-from"');
    expect(markup).toContain('data-testid="filter-to"');
    expect(markup).toContain("Showing 1 pairs");
  });

  it("disables From/To unless a custom range is active", () => {
    const off = renderToStaticMarkup(<FilterBar {...barProps()} />);
    expect(inputTag(off, "filter-from")).toMatch(/disabled=""/);
    expect(inputTag(off, "filter-to")).toMatch(/disabled=""/);
    const custom = api({ query: { ...defaultQuery(), scope: { mode: "range", month: "", from: "2026-10-01T00:00", to: "" } } });
    const on = renderToStaticMarkup(<FilterBar r={custom} items={[PAIR]} shown={1} />);
    expect(inputTag(on, "filter-from")).not.toMatch(/disabled=""/);
    expect(inputTag(on, "filter-from")).toContain('value="2026-10-01T00:00"');
  });

  it("labels the sort key and orders with names for the current key", () => {
    const markup = renderToStaticMarkup(<FilterBar {...barProps()} />);
    expect(markup).toContain("SORT BY");
    expect(markup).toContain("date / status / name / path");
    expect(markup).toContain("Creation date");
    expect(markup).toContain("Newest first");
    expect(markup).toContain("Oldest first");
    expect(markup).toContain("STATUS");
    expect(markup).toContain("All decisions");
  });
});

describe("RootBar / StatusBar (design header and bottom bar)", () => {
  it("shows the root, rescan, the recursive folder count and the counters", () => {
    const markup = renderToStaticMarkup(<RootBar r={api()} folders={16} />);
    expect(markup).toContain("Root: split_output");
    expect(markup).toContain("Rescan");
    expect(markup).toContain("Recursive · 16 nested folders");
    expect(markup).toContain('data-testid="count-total"');
    for (const label of ["total", "pending", "approved", "declined"]) expect(markup).toContain(`>${label}<`);
  });

  it("shows the index state, last rescan, diff, retry warning and progress", () => {
    const markup = renderToStaticMarkup(
      <StatusBar rootName="split_output" busy={null} lastScanAt={Date.now() - 24_000}
        delta={{ added: 3, renamed: 1, removed: 0, changed: 0, kept: 180 }} unsaved={1}
        counts={{ total: 184, pending: 63, approved: 108, declined: 13 }} watcher />,
    );
    expect(markup).toContain("Recursive index ready");
    expect(markup).toContain("Last rescan:");
    expect(markup).toContain("+3 new · 1 renamed · 0 removed · 180 unchanged");
    expect(markup).toContain("1 decision awaiting retry");
    expect(markup).toContain("121 / 184 reviewed");
    expect(markup).toContain('role="progressbar"');
  });
});

describe("Warnings (spec §8, §10)", () => {
  it("warns about an unwritable file with an actionable retry", () => {
    const markup = renderToStaticMarkup(<Warnings r={api({ fileStatus: "write-error", fileNote: "Could not save decisions — disk full" })} />);
    expect(markup).toContain("Decision file could not be written.");
    expect(markup).toContain("retained in memory");
    expect(markup).toContain("Retry write");
    expect(markup).toContain("review-decisions.json");
  });

  it("offers a backup-and-restart for a corrupt file and counts unpaired entries", () => {
    const markup = renderToStaticMarkup(<Warnings r={api({ fileStatus: "corrupt", fileNote: "Not valid JSON", items: [PAIR, item("solo", "pending", { ai: false })] })} />);
    expect(markup).toContain("Decision file could not be read.");
    expect(markup).toContain("Back up corrupt file &amp; start fresh");
    expect(markup).toContain("1 entry has no matching side");
  });
});

describe("Selection tab wiring (spec §12 — appears after Batch folders)", () => {
  it("brands the shell and places the Selection tab directly after Batch folders", () => {
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain("Image Operator");
    expect(html).toContain('data-testid="help-button"');
    expect(html.indexOf("Batch folders")).toBeLessThan(html.indexOf("Selection"));
    expect(html).toContain('data-testid="app-status-slot"');
  });

  it("renders the review panel with its empty state instead of crashing", () => {
    const html = renderToStaticMarkup(<ReviewPanel />);
    expect(html).toContain("Choose split root…");
    expect(html).toContain("Rescan");
    expect(html).toContain("total");
    expect(html).toContain("Clear filters");
    expect(html).toContain("No images found in this folder");
    expect(html).toContain('data-testid="review-statusbar"');
  });
});

describe("hotkey map (spec §5, design keyboard legend)", () => {
  it("maps A, D, arrows, Space and Escape outside text fields", () => {
    expect(hotkeyAction("a", "DIV")).toBe("approve");
    expect(hotkeyAction("A", "DIV")).toBe("approve");
    expect(hotkeyAction("d", "BODY")).toBe("decline");
    expect(hotkeyAction("ArrowDown", "BODY")).toBe("next");
    expect(hotkeyAction("ArrowUp", "BODY")).toBe("prev");
    expect(hotkeyAction("ArrowRight", "BODY")).toBe("next");
    expect(hotkeyAction("ArrowLeft", "BODY")).toBe("prev");
    expect(hotkeyAction(" ", "DIV")).toBe("zoom");
    expect(hotkeyAction("Escape", "BODY")).toBe("close");
    expect(hotkeyAction("q", "BODY")).toBeNull();
  });

  it("never steals keys from inputs, selects or a focused button", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(hotkeyAction("a", tag)).toBeNull();
      expect(hotkeyAction("Escape", tag)).toBeNull();
    }
    expect(hotkeyAction(" ", "BUTTON")).toBeNull(); // Space belongs to the button
  });
});
