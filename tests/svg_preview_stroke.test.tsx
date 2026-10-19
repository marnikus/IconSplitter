// svg_preview_stroke.test.tsx — the pinned bar's preview stroke width (user
// request 2026-10-19; plan: docs/archive/2026-10-19-svg-preview-stroke). A
// preview-only setting: every row thumbnail shows ONE stroke width the user
// picks, through ONE shared stylesheet adopted by the previews' shadow roots
// (no re-parse, no row re-render). Default empties the sheet so each file's own
// widths show again. Saved files never change.
import { describe, expect, it } from "vitest";
import { clampStroke, parseStoredStroke, parseStrokeInput, strokeCss, strokeLabel } from "../src/lib/previewstroke";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { FOG, SAVED_SVG, click, installSvgPanelHooks, makeRoot, mount, q, settle, type, unmountPanel, renderPanel } from "./helpers/svgpanel";

installSvgPanelHooks();

describe("lib/previewstroke", () => {
  it("clamps to 0–50 and rounds to 0.1", () => {
    expect(clampStroke(-1)).toBe(0);
    expect(clampStroke(60)).toBe(50);
    expect(clampStroke(2.345)).toBe(2.3);
  });

  it("reads the field: empty or 'default' is default, a number is clamped, anything else is invalid", () => {
    expect(parseStrokeInput("")).toEqual({ ok: true, px: null });
    expect(parseStrokeInput(" Default ")).toEqual({ ok: true, px: null });
    expect(parseStrokeInput("2.5")).toEqual({ ok: true, px: 2.5 });
    expect(parseStrokeInput("3px")).toEqual({ ok: true, px: 3 });
    expect(parseStrokeInput("0,5")).toEqual({ ok: true, px: 0.5 });
    expect(parseStrokeInput("80")).toEqual({ ok: true, px: 50 });
    expect(parseStrokeInput("abc")).toEqual({ ok: false });
    expect(parseStrokeInput("2.")).toEqual({ ok: true, px: 2 });
  });

  it("a stored value is validated on read (RULE 13)", () => {
    expect(parseStoredStroke(4)).toBe(4);
    expect(parseStoredStroke(99)).toBe(50);
    expect(parseStoredStroke(null)).toBeNull();
    expect(parseStoredStroke("4")).toBeNull();
    expect(parseStoredStroke(Number.NaN)).toBeNull();
  });

  it("the rule overrides every stroke width; default is no rule at all", () => {
    expect(strokeCss(null)).toBe("");
    expect(strokeCss(4)).toBe("svg, svg * { stroke-width: 4px !important; }");
    expect(strokeLabel(null)).toBe("default");
    expect(strokeLabel(0.5)).toBe("0.5 px");
  });
});

const field = () => q("[data-testid=svg-stroke]") as HTMLInputElement;
const reset = () => q("[data-testid=svg-stroke-reset]") as HTMLButtonElement;
const preview = () => q(`[data-testid=svg-prev-${FOG}]`)!;

/** The CSS a shadow root's adopted sheets carry, whitespace-normalized. */
function adopted(el: Element): string | null {
  const root = el.shadowRoot as (ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] }) | null;
  const sheets = root?.adoptedStyleSheets ?? [];
  if (sheets.length === 0) return null;
  return sheets.map((s) => [...s.cssRules].map((r) => r.cssText).join(" ")).join(" ").replace(/\s+/g, " ");
}

function savedText(root: FakeDir): string {
  return ((root.children.get("architecture") as FakeDir).children.get("fog_AI.svg") as FakeFile).text;
}

async function mountReady(): Promise<FakeDir> {
  const root = await makeRoot();
  await mount(root);
  await settle();
  return root;
}

describe("preview stroke control in the pinned bar", () => {
  it("sits in the pin, starts at default, Reset disabled", async () => {
    await mountReady();
    const pin = q("[data-testid=svg-bulkbar-pin]")!;
    expect(pin.querySelector("[data-testid=svg-stroke]")).not.toBeNull();
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("default");
    expect(q("[data-testid=svg-stroke-value]")?.textContent).toBe("default");
    expect(reset().disabled).toBe(true);
    expect(adopted(preview()) ?? "").not.toContain("stroke-width");
  });

  it("a width restyles every row thumbnail via the shared sheet; artwork and files untouched", async () => {
    const root = await mountReady();
    const before = preview().shadowRoot!.innerHTML;
    await type("[data-testid=svg-stroke]", "4");
    await settle();
    expect(adopted(preview())).toMatch(/stroke-width: 4px !important/);
    expect(preview().shadowRoot!.innerHTML).toBe(before); // nothing re-parsed or rewritten
    expect(savedText(root)).toBe(SAVED_SVG);
    expect(q("[data-testid=svg-stroke-value]")?.textContent).toBe("4 px");
    expect(reset().disabled).toBe(false);
    await type("[data-testid=svg-stroke]", "12.5");
    await settle();
    expect(adopted(preview())).toMatch(/stroke-width: 12.5px !important/);
  });

  it("Reset brings back each file's own widths", async () => {
    await mountReady();
    await type("[data-testid=svg-stroke]", "4");
    await settle();
    await click(reset());
    await settle();
    expect(adopted(preview()) ?? "").not.toContain("stroke-width");
    expect(field().value).toBe("");
    expect(q("[data-testid=svg-stroke-value]")?.textContent).toBe("default");
    expect(reset().disabled).toBe(true);
  });

  it("typing the word 'default' is the same as Reset", async () => {
    await mountReady();
    await type("[data-testid=svg-stroke]", "4");
    await type("[data-testid=svg-stroke]", "default");
    await settle();
    expect(adopted(preview()) ?? "").not.toContain("stroke-width");
  });

  it("invalid text is flagged and keeps the last valid width", async () => {
    await mountReady();
    await type("[data-testid=svg-stroke]", "3");
    await type("[data-testid=svg-stroke]", "abc");
    await settle();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(adopted(preview())).toMatch(/stroke-width: 3px !important/);
  });

  it("the width is remembered across a restart", async () => {
    await mountReady();
    await type("[data-testid=svg-stroke]", "6");
    await settle();
    await unmountPanel();
    await renderPanel();
    await settle();
    await settle();
    expect(field().value).toBe("6");
    expect(adopted(preview())).toMatch(/stroke-width: 6px !important/);
  });

  it("the Versions dialog keeps the real widths", async () => {
    await mountReady();
    await type("[data-testid=svg-stroke]", "4");
    await settle();
    await click(q(`[data-testid=svg-history-${FOG}]`)!);
    await settle();
    const art = q("[data-testid=svg-history-art-1]") ?? document.querySelector("[data-testid=svg-history-art-1]");
    expect(art).not.toBeNull();
    expect(adopted(art!) ?? "").not.toContain("stroke-width");
  });
});
