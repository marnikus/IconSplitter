// batch_preview_column.test.tsx — the Preview splits column of the Batch row.
// A batch row carries BOTH `.svg-row` and `.batch-row`, so at equal specificity
// the LATER `.svg-row` rule (8 tracks: preview 122px + a dead 210px track) won
// the cascade — the strip showed two icons behind a scrollbar while File / path
// ate every free pixel as `1fr`. These tests resolve that cascade the way a
// browser does (specificity, then order) and pin the winner: the AI thumb keeps
// its own zoomed box (I-55), File / path is bounded, and Preview splits takes
// ALL the space between the file name and Created — wide enough for the icons
// of a split to sit in one row, wrapping to a second instead of scrolling.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScanTable from "../src/batch/ScanTable";
import type { PreviewEntry } from "../src/batch/useBatchPreview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Rule {
  sel: string;
  body: string;
  media: string | null;
  at: number;
}

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Flat rule list; `@media` blocks are descended into and label their rules. */
function collect(text: string, media: string | null, offset: number, out: Rule[]): void {
  let i = 0;
  for (;;) {
    const open = text.indexOf("{", i);
    if (open < 0) return;
    const close = closingBrace(text, open);
    if (close < 0) return;
    const sel = text.slice(i, open).trim();
    const body = text.slice(open + 1, close);
    if (sel.startsWith("@media")) collect(body, sel, offset + open + 1, out);
    else if (!sel.startsWith("@")) out.push({ sel, body, media, at: offset + i });
    i = close + 1;
  }
}

const rules = (): Rule[] => {
  const out: Rule[] = [];
  collect(css(), null, 0, out);
  return out;
};

/** The classes the real elements carry (ScanTable: `svg-row batch-row <status>`). */
const ROW = ["svg-row", "batch-row", "unprocessed"];
const HEAD = ["svg-columns", "batch-columns"];
const NARROW = "@media (max-width: 1360px)";

/** Class-only compounds: ids, attributes and pseudo-classes are not our element. */
function compoundMatches(part: string, classes: string[]): boolean {
  const last = part.split(/[\s>+~]+/).pop() ?? "";
  if (last.includes("#") || last.includes("[") || last.includes(":")) return false;
  const names = last.split(".").filter(Boolean).slice(last.startsWith(".") ? 0 : 1);
  return names.length > 0 && names.every((n) => classes.includes(n));
}

const specificity = (sel: string) => (sel.match(/\./g) ?? []).length;

/** The rule a browser would use for these classes at this width. */
function winningRule(classes: string[], media: string | null): Rule {
  const hits = rules().filter((r) => r.media === media && r.body.includes("grid-template-columns") && r.sel.split(",").some((p) => compoundMatches(p.trim(), classes)));
  const winner = hits.sort((a, b) => specificity(a.sel) - specificity(b.sel) || a.at - b.at).pop();
  if (!winner) throw new Error(`no grid-template-columns rule matched .${classes.join(".")}`);
  return winner;
}

const template = (classes: string[], media: string | null) =>
  /grid-template-columns:\s*([^;}]+)/.exec(winningRule(classes, media).body)![1].replace(/\s*!important/, "").trim();

/** Track list of a template — `minmax(300px, 1fr)` stays ONE track. */
function tracks(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const rowTracks = tracks(template(ROW, null));
const headTracks = tracks(template(HEAD, null));
const narrowTracks = tracks(template(ROW, NARROW));

let host: HTMLDivElement;
let ui: Root;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

const row = (relPath: string) =>
  ({ relPath, name: relPath.split("/").pop()!, mtime: 1_700_000_000_000, status: "unprocessed", selected: true, refRelPath: "ref.png", dirPath: "" }) as never;

async function renderTable(previews: Map<string, PreviewEntry>) {
  await act(async () => {
    ui.render(
      <ScanTable
        rows={[row("icon-award-ribbon_8_01_AI.png"), row("sub/icon-flame_2_AI.png")]}
        thumb={84}
        activeId={null}
        toggle={vi.fn()}
        selectRow={vi.fn()}
        copyPath={vi.fn()}
        thumbFor={async () => ""}
        previews={previews}
      />,
    );
  });
}

describe("the batch grid beats the SVG tab's grid", () => {
  it("is declared by a selector more specific than `.svg-row` alone", () => {
    // Equal specificity is exactly how the 8-track SVG template hijacked the row.
    expect(specificity(winningRule(ROW, null).sel)).toBeGreaterThan(1);
    expect(specificity(winningRule(HEAD, null).sel)).toBeGreaterThan(1);
    expect(specificity(winningRule(ROW, NARROW).sel)).toBeGreaterThan(1);
  });

  it("lays the row and its header out in seven tracks at every width", () => {
    expect(rowTracks).toHaveLength(7);
    expect(headTracks).toHaveLength(7);
    expect(narrowTracks).toHaveLength(7);
  });

  it("leaves the other tabs' own rows alone", () => {
    expect(tracks(template(["svg-row", "queued"], null))).toHaveLength(8); // Generate SVG
    expect(tracks(template(["v2-row"], null))).toHaveLength(8); // Selection V2
    expect(tracks(template(["up-row"], null))).toHaveLength(7); // SVG to upload
  });
});

describe("where the Preview splits column starts and how wide it is", () => {
  it("keeps the AI thumbnail at the thumb's own zoomed width (I-55)", () => {
    expect(rowTracks[1]).toBe("max-content");
    expect(narrowTracks[1]).toBe("max-content");
  });

  it("never lets File / path take the free space", () => {
    // `1fr` here is the gap the report showed: a wide column, a short name.
    for (const file of [rowTracks[2], headTracks[2], narrowTracks[2]]) expect(file).not.toMatch(/1fr/);
  });

  it("gives Preview splits every pixel up to Created", () => {
    expect(rowTracks[3]).toMatch(/1fr/);
    expect(headTracks[3]).toMatch(/1fr/);
    expect(narrowTracks[3]).toMatch(/1fr/);
    // Four 48px icons + three 6px gaps = 210px: the floor must hold one full row.
    expect(Number(/(\d+)px/.exec(rowTracks[3])![1])).toBeGreaterThanOrEqual(240);
    expect(Number(/(\d+)px/.exec(narrowTracks[3])![1])).toBeGreaterThanOrEqual(240);
  });

  it("keeps Created, Status and Open after it, and nothing beyond", () => {
    expect(rowTracks.slice(4)).toHaveLength(3);
    expect(narrowTracks.slice(4)).toHaveLength(3);
  });
});

describe("the preview cell in the row", () => {
  it("is the fourth cell and wraps its icons instead of scrolling them", async () => {
    const rel = "icon-award-ribbon_8_01_AI.png";
    await renderTable(new Map([[rel, { relPath: rel, count: 4, thumbs: ["a.png", "b.png", "c.png", "d.png"], boxes: [], status: "done" }]]));
    const one = host.querySelector(`[data-testid='batch-row-${rel}']`) as HTMLElement;
    expect([...one.children]).toHaveLength(7);

    const strip = one.children[3].querySelector(`[data-testid='batch-preview-strip-${rel}']`) as HTMLElement;
    expect(strip).not.toBeNull();
    expect(strip.className).toMatch(/flex-wrap/);
    expect(strip.className).not.toMatch(/overflow-x-auto/);
    expect(strip.querySelectorAll("img")).toHaveLength(4);
    expect(one.children[3].className).toMatch(/min-w-0/); // a wrapped strip needs a shrinkable cell
  });

  it("shows every icon of the split — none is hidden behind a scroll", async () => {
    const rel = "sub/icon-flame_2_AI.png";
    const thumbs = Array.from({ length: 10 }, (_, i) => `t${i}.png`);
    await renderTable(new Map([[rel, { relPath: rel, count: 10, thumbs, boxes: [], status: "done" }]]));
    const strip = host.querySelector(`[data-testid='batch-preview-strip-${rel}']`) as HTMLElement;
    expect(strip.querySelectorAll("img")).toHaveLength(10);
    for (const img of strip.querySelectorAll("img")) expect(img.style.flex).toMatch(/^(none|0 0 auto)$/); // never squeezed
    expect(host.querySelector(`[data-testid='batch-preview-count-${rel}']`)!.textContent).toMatch(/10 icons/);
  });
});
