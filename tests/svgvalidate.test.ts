import { afterEach, describe, expect, it, vi } from "vitest";
import { distinctIconWarning, extractSvgDocuments, renderedSvgHasInk, sanitizeSvg } from "../src/lib/svgvalidate";

const good = (title = "leaf_AI.png", content = "<path d=\"M1 1h8v8H1z\"/>") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>${title}</title>${content}</svg>`;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("SVG response extraction and validation", () => {
  it("extracts complete roots from prose without mistaking nested roots for new outputs", () => {
    expect(extractSvgDocuments(`Here: ${good()} and ${good("second.png")}`)).toEqual([good(), good("second.png")]);
    const compact = `<svg viewBox="0 0 1 1"/>`;
    expect(extractSvgDocuments(`Compact: ${compact}`)).toEqual([compact]);
    expect(extractSvgDocuments("nothing to see here")).toEqual([]);
    expect(extractSvgDocuments("x".repeat(5_120_001))).toEqual([]);
  });

  it("requires well-formed SVG XML, exact title, positive viewBox and dimensions", () => {
    expect(sanitizeSvg(good(), "leaf_AI.png").ok).toBe(true);
    expect(sanitizeSvg(good("wrong.png"), "leaf_AI.png")).toMatchObject({ ok: false });
    expect(sanitizeSvg(good().replace("viewBox=\"0 0 10 10\"", "viewBox=\"0 0 0 10\""), "leaf_AI.png")).toMatchObject({ ok: false });
    expect(sanitizeSvg(good().replace("<path", "<path").replace("/></svg>", "</svg>"), "leaf_AI.png")).toMatchObject({ ok: false });
    expect(sanitizeSvg(good().replace("viewBox=\"0 0 10 10\"", "viewBox=\"0 0 10 10\" width=\"0\""), "leaf_AI.png")).toMatchObject({ ok: false });
    expect(sanitizeSvg(`<!DOCTYPE svg [<!ENTITY x "boom">]>${good()}`, "leaf_AI.png")).toMatchObject({ ok: false });
    expect(sanitizeSvg("<svg><title>x</title>", "leaf_AI.png")).toMatchObject({ ok: false });
  });

  it("fails closed if XML parsing itself throws", () => {
    vi.stubGlobal("DOMParser", class { constructor() { throw new Error("parser unavailable"); } });
    expect(sanitizeSvg(good(), "leaf_AI.png")).toMatchObject({ ok: false, error: "SVG is not well-formed XML." });
  });

  it("removes scripts, foreign objects, external URLs, event handlers, styles and comments", () => {
    const hostile = `<svg viewBox="0 0 10 10" onload="steal()"><title>leaf_AI.png</title><!-- hidden -->
      <script>secret()</script><foreignObject><iframe src="https://evil.invalid"></iframe></foreignObject>
      <image href="https://evil.invalid/pixel"/><path d="M1 1h8v8H1z" onclick="x()" style="fill:url(https://evil.invalid/x)" fill="red"/>
    </svg>`;
    const result = sanitizeSvg(hostile, "leaf_AI.png");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.svg).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
    expect(result.svg).toContain("fill=\"red\"");
    expect(result.svg).not.toMatch(/script|foreignObject|iframe|evil\.invalid|onload|onclick|style=|secret\(\)/i);
  });

  it("keeps safe local paint references, removes explanatory text and checks numeric paint", () => {
    const local = `<svg viewBox="0 0 10 10"><title>leaf_AI.png</title><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><path d="M1 1h8v8H1z" fill="url(#g)"/></svg>`;
    const valid = sanitizeSvg(local, "leaf_AI.png");
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.svg).toContain("url(#g)");
    const explanatory = `<svg viewBox="0 0 10 10"><title>leaf_AI.png</title>note<path d="M1 1h8v8H1z" fill="none" stroke="black" stroke-width="2" stroke-opacity="bad"/></svg>`;
    const cleaned = sanitizeSvg(explanatory, "leaf_AI.png");
    expect(cleaned.ok).toBe(true);
    if (cleaned.ok) expect(cleaned.warnings).toContain("Explanatory text inside the SVG was removed.");
    const invisible = `<svg viewBox="0 0 10 10"><title>leaf_AI.png</title><path d="M1 1h8v8H1z" fill="none" stroke="none"/></svg>`;
    expect(sanitizeSvg(invisible, "leaf_AI.png")).toMatchObject({ ok: false });
  });

  it("normalizes dimensions and rejects oversized source text", () => {
    const checked = sanitizeSvg(`<svg viewBox="0, 0, 24, 16"><title>leaf_AI.png</title><circle cx="12" cy="8" r="5"/></svg>`, "leaf_AI.png");
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.viewBox).toBe("0 0 24 16");
      expect(checked.svg).toContain('width="24"');
      expect(checked.svg).toContain('height="16"');
    }
    expect(sanitizeSvg("x".repeat(512_001), "leaf_AI.png")).toMatchObject({ ok: false });
  });

  it("compares distinct geometry independent of title and description", () => {
    const first = good("one.png", "<title>inner</title><path d=\"M1 1h8v8H1z\"/>");
    const second = good("two.png", "<title>another</title><path d=\"M1 1h8v8H1z\"/>");
    expect(distinctIconWarning(2, [first, second])).toContain("found 1 distinct output");
    expect(distinctIconWarning(2, [first, good("two.png", "<circle cx=\"5\" cy=\"5\" r=\"4\"/> ")])).toBeNull();
  });
});

describe("rendered SVG visibility gate", () => {
  it("requires at least one nontransparent sampled pixel and handles decode failures", async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 10;
      naturalHeight = 10;
      set src(_value: string) { /* decode below resolves */ }
      decode = () => Promise.resolve();
    }
    vi.stubGlobal("Image", FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
    } as unknown as CanvasRenderingContext2D));
    await expect(renderedSvgHasInk(good())).resolves.toBe(true);

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }),
    } as unknown as CanvasRenderingContext2D));
    await expect(renderedSvgHasInk(good())).resolves.toBe(false);

    class BrokenImage {
      decode = () => Promise.reject(new Error("decode failed"));
      set src(_value: string) { /* decode rejects below */ }
    }
    vi.stubGlobal("Image", BrokenImage);
    await expect(renderedSvgHasInk(good())).resolves.toBe(false);
  });
});
