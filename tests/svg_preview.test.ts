// svg_preview.test.ts — the SVG preview pipeline executes for real (RULE 8).
// Every case reproduces one of the preview defects recorded in
// docs/archive/2026-10-01-svg-preview-rendering/design.md: a saved document that
// copies as valid code but painted nothing (no xmlns, XML prolog, unbound
// prefix), painted wrong (no intrinsic size, currentColor on a dark frame,
// cross-row id collisions) or painted nothing at all with no reason given.
// Each assertion fails if src/lib/svgpreview.ts is deleted.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSvgPreview, PREVIEW_CSS, STANDALONE_INK } from "../src/lib/svgpreview";
import { isPreferredTarget, previewTargetOf, targetVersionOf } from "../src/svg/rowmodel";
import { withPreference, withVersion, type PairMeta } from "../src/lib/pairmeta";
import type { SvgVersion } from "../src/lib/svgmodel";
import { toRow } from "../src/svg/rowmodel";
import type { SvgRow } from "../src/svg/types";
import { pairMetaFor, svgSource } from "./helpers/svgpair";

const NS = "http://www.w3.org/2000/svg";

/** A stroke-only line icon, exactly what the prompt produces (D4). */
const STROKE_ONLY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M12 4v16"/></svg>`;

function preview(code: string | null) {
  return buildSvgPreview(code);
}

describe("buildSvgPreview — documents that copy but did not paint", () => {
  it("adds the missing xmlns declaration (D1)", () => {
    const p = preview(STROKE_ONLY);
    expect(p.ok).toBe(true);
    expect(p.html).toContain(`xmlns="${NS}"`);
    expect(p.html.startsWith("<svg")).toBe(true);
  });

  it("accepts an XML prolog, a doctype and a leading comment (D2)", () => {
    const prolog = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n<!-- made by hand -->\n${STROKE_ONLY}`;
    const p = preview(prolog);
    expect(p.ok).toBe(true);
    expect(p.viewBox).toBe("0 0 24 24");
    // only the drawing is inlined — a prolog inlined into HTML is junk
    expect(p.html.startsWith("<svg")).toBe(true);
    expect(p.html).not.toContain("<?xml");
    expect(p.html).not.toContain("DOCTYPE");
  });

  it("repairs an unbound xlink prefix instead of rejecting the document", () => {
    const code = `<svg xmlns="${NS}" viewBox="0 0 24 24"><defs><path id="p" d="M2 2h4v4H2z"/></defs><use xlink:href="#p"/></svg>`;
    const p = preview(code);
    expect(p.ok).toBe(true);
    expect(p.html).toContain(`xmlns:xlink="http://www.w3.org/1999/xlink"`);
    expect(p.html).toContain(`xlink:href="#`);
  });

  it("keeps a document that already declares its namespaces byte-for-byte", () => {
    const code = `<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
    const p = preview(code);
    expect(p.ok).toBe(true);
    expect(p.html.match(/xmlns=/g)).toHaveLength(1);
  });
});

describe("buildSvgPreview — fit, centre and stroke width", () => {
  it("derives a viewBox from px width/height when none is declared (D3)", () => {
    const p = preview(`<svg xmlns="${NS}" width="512" height="256"><path d="M0 0h512v256H0z"/></svg>`);
    expect(p.ok).toBe(true);
    expect(p.viewBox).toBe("0 0 512 256");
    expect(p.ratio).toBe(2);
  });

  it("scales every box uniformly: 100% frame, centred, ratio kept", () => {
    for (const [box, ratio] of [["0 0 24 24", 1], ["0 0 64 32", 2], ["0 0 512 128", 4], ["-8 -8 32 16", 2]] as const) {
      const p = preview(`<svg xmlns="${NS}" viewBox="${box}"><path d="M0 0h1v1H0z"/></svg>`);
      expect(p.ok).toBe(true);
      expect(p.viewBox).toBe(box);
      expect(p.ratio).toBe(ratio);
      expect(p.html).toContain(`width="100%"`);
      expect(p.html).toContain(`height="100%"`);
      expect(p.html).toContain(`preserveAspectRatio="xMidYMid meet"`);
    }
  });

  it("never recolours the artwork: currentColor resolves as a standalone document does (D4)", () => {
    // The saved document decides its own colours. A standalone SVG resolves
    // currentColor to the UA default (black). The app never chooses an ink:
    // the default is a PRESENTATION ATTRIBUTE on the root (the weakest kind of
    // declaration), so every author value still wins.
    expect(STANDALONE_INK).toBe("#000000");
    const p = preview(STROKE_ONLY);
    expect(p.html).toContain(`stroke="currentColor"`);
    expect(p.html).toContain(`color="${STANDALONE_INK}"`);
    // No stylesheet and no style attribute may force a colour onto the artwork.
    expect(PREVIEW_CSS).not.toContain("color");
    expect(p.html).not.toContain(`style="color`);
    // Explicit colours are carried through untouched.
    const white = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path fill="#ffffff" d="M2 2h20v20H2z"/></svg>`);
    expect(white.html).toContain(`fill="#ffffff"`);
    const black = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path stroke="#000000" d="M2 2h20v20H2z"/></svg>`);
    expect(black.html).toContain(`stroke="#000000"`);
  });

  it("keeps every colour the document declares — attribute, style, descendant and opacity", () => {
    // An author's own colour declaration survives, and is not overridden.
    const own = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24" style="color:#ff0000;opacity:.9"><path stroke="currentColor" d="M2 2h20v20H2z"/></svg>`);
    expect(own.html).toContain("color:#ff0000");
    expect(own.html).toContain("opacity:.9");
    expect(own.html).not.toContain(STANDALONE_INK);
    // ...including the presentation attribute form, which a stylesheet would beat.
    const attr = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24" color="#00ff00"><path stroke="currentColor" d="M2 2h20v20H2z"/></svg>`);
    expect(attr.html).toContain(`color="#00ff00"`);
    expect(attr.html).not.toContain(STANDALONE_INK);
    // ...and a descendant that sets its own colour or opacity.
    const inner = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><g fill="#123456" opacity="0.4"><path d="M2 2h20v20H2z"/></g></svg>`);
    expect(inner.html).toContain(`fill="#123456"`);
    expect(inner.html).toContain(`opacity="0.4"`);
    // A hex colour is not an id: scoping must never touch it.
    const hex = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path fill="#ff0000" d="M2 2h20v20H2z"/><path id="ff0000" d="M1 1h2v2H1z"/></svg>`);
    expect(hex.html).toContain(`fill="#ff0000"`);
  });

  it("carries a multicolour document through byte-for-byte (fills, strokes, gradient, opacity)", () => {
    // The prompt's verify list: black, white AND multicolour artwork. Every
    // colour the document declares must come out the way it went in — nothing
    // is normalised, brightened, inverted or dropped.
    const doc = `<svg xmlns="${NS}" viewBox="0 0 24 24">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/>
      </linearGradient></defs>
      <rect width="24" height="24" fill="url(#g1)" opacity="0.8"/>
      <path fill="#00ff00" stroke="#123456" stroke-width="1.5" d="M2 2h20v20H2z"/>
      <path fill="none" stroke="currentColor" stroke-dasharray="2 2" opacity="0.5" d="M4 4h16v16H4z"/>
      <circle cx="12" cy="12" r="3" fill="#ffffff"/>
    </svg>`;
    const p = preview(doc);
    expect(p.ok).toBe(true);
    for (const fragment of [
      `opacity="0.8"`, `stop-color="#ff0000"`, `stop-color="#0000ff"`,
      `fill="#00ff00"`, `stroke="#123456"`, `stroke-width="1.5"`, `stroke-dasharray="2 2"`,
      `opacity="0.5"`, `fill="#ffffff"`, `stroke="currentColor"`,
    ]) {
      expect(p.html).toContain(fragment);
    }
    // The gradient id is scoped for this shadow root (ids must not collide), so
    // the reference is rewritten to the SAME scoped id — the gradient keeps
    // pointing at the document's own stops, never at another document's or at
    // some app-chosen colour.
    const scoped = /id="([^"]*g1)"/.exec(p.html)?.[1] ?? "";
    expect(scoped).not.toBe("");
    expect(p.html).toContain(`fill="url(#${scoped})"`);
    expect(p.html).not.toContain(`stop-color="#000000"`);
    // the preview never paints the artwork itself: the stylesheet is layout only
    expect(PREVIEW_CSS).not.toContain("background");
  });

  it("never applies a filter, a stroke override or an inversion", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24" stroke-width="2"><path fill="none" stroke="#ffffff" d="M2 2h20v20H2z"/></svg>`);
    expect(p.html).not.toContain("filter");
    expect(p.html).not.toContain("invert");
    expect(p.html).toContain(`stroke="#ffffff"`);
    expect(p.html).toContain(`stroke-width="2"`);
    // The preview stylesheet is layout only: no ink, no filter, no override.
    expect(PREVIEW_CSS).not.toContain("filter");
    expect(PREVIEW_CSS).not.toContain("invert");
    expect(PREVIEW_CSS).not.toContain("stroke");
    expect(PREVIEW_CSS).not.toContain("fill");
    expect(PREVIEW_CSS).not.toContain("opacity");
  });

  it("keeps the app's CSS out of the artwork (the frame is the only coloured surface)", () => {
    // The contrast hint for a dark background is a frame outline, never a
    // filter on the document — so no preview CSS may paint the artwork.
    const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/\.svg-preview-frame\.contrast\s*\{[^}]*outline/);
    expect(css).not.toMatch(/\.svg-preview[^{,]*\{[^}]*filter\s*:/);
  });

  it("keeps one zoom value behind both previews and the row they sit in", () => {
    // One CSS variable: the box size of BOTH previews (inline px), the row's
    // minimum height and the previews column width. That is what makes them
    // resize in step without ever overlapping the next column.
    const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/\.svg-thumb\s*\{[^}]*object-fit:\s*contain/);
    expect(css).toMatch(/\.svg-row\s*\{[^}]*min-height:\s*calc\(var\(--svg-thumb\)/);
    expect(css).toMatch(/grid-template-columns:\s*[^;]*calc\(var\(--svg-thumb\)\s*\*\s*2/);
  });

  it("drops the root's own width/height so the fit cannot be overridden", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24" style="width:512px;height:512px;opacity:.9"><path d="M2 2h20v20H2z"/></svg>`);
    expect(p.ok).toBe(true);
    expect(p.html).not.toContain("512px");
    expect(p.html).toContain("opacity:.9");
  });

  it("keeps the artwork's own background rect and its transparency", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><rect width="24" height="24" fill="#101010"/><path d="M2 2h20v20H2z"/></svg>`);
    expect(p.html).toContain(`<rect width="24" height="24" fill="#101010"/>`);
    const plain = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`);
    expect(plain.html).not.toContain("<rect");
  });
});

describe("buildSvgPreview — sanitizing the saved document", () => {
  it("removes scripts, event handlers, javascript: URLs and remote references", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24">`
      + `<script>alert(1)</script>`
      + `<path onload="alert(2)" d="M2 2h20v20H2z"/>`
      + `<a href="javascript:alert(3)"><circle cx="4" cy="4" r="2"/></a>`
      + `<image href="https://tracker.example/x.png" width="8" height="8"/>`
      + `<use href="https://cdn.example/defs.svg#x"/>`
      + `<foreignObject><iframe src="https://tracker.example"></iframe></foreignObject>`
      + `</svg>`);
    expect(p.ok).toBe(true);
    expect(p.html).not.toContain("script");
    expect(p.html).not.toContain("onload");
    expect(p.html).not.toContain("javascript:");
    expect(p.html).not.toContain("tracker.example");
    expect(p.html).not.toContain("cdn.example");
    expect(p.html).not.toContain("foreignObject");
    expect(p.html).toContain(`<path d="M2 2h20v20H2z"/>`);
  });

  it("keeps local fragment references and inline data images (RULE 20)", () => {
    const p = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><defs><path id="p" d="M2 2h4v4H2z"/></defs>`
      + `<use href="#p"/><image href="data:image/png;base64,AAAA" width="4" height="4"/></svg>`);
    expect(p.html).toContain("<use");
    expect(p.html).toContain("data:image/png;base64,AAAA");
    expect(p.html).not.toContain('href=""');
  });

  it("keeps a safe <style> and drops one that imports or fetches", () => {
    const safe = preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><style>.cls-1{fill:#fff;stroke:url(#g)}</style><path class="cls-1" d="M2 2h20v20H2z"/></svg>`);
    expect(safe.html).toContain(".cls-1{fill:#fff;stroke:url(#g)}");
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><style>@import url(https://evil.example/a.css);</style><path d="M2 2h20v20H2z"/></svg>`).html).not.toContain("@import");
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><style>.a{background:url(https://evil.example/b.png)}</style><path d="M2 2h20v20H2z"/></svg>`).html).not.toContain("evil.example");
  });

  it("rewrites ids inside a <style> but never a hex colour", () => {
    const code = `<svg xmlns="${NS}" viewBox="0 0 24 24"><style>#g{fill:#fff}.a{stroke:#0f0}</style>`
      + `<defs><linearGradient id="g"/></defs><rect width="24" height="24" fill="url(#g)"/></svg>`;
    const p = preview(code);
    const scoped = /id="([^"]+)"/.exec(p.html)?.[1] ?? "";
    expect(scoped).not.toBe("g");
    expect(p.html).toContain(`#${scoped}{fill:#fff}`);
    expect(p.html).toContain("stroke:#0f0");
  });

  it("scopes ids so two previews cannot share one definition", () => {
    const doc = (stop: string) => `<svg xmlns="${NS}" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop stop-color="${stop}"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/></svg>`;
    const a = preview(doc("#ffffff"));
    const b = preview(doc("#000000"));
    const idA = /id="([^"]+)"/.exec(a.html)?.[1];
    const idB = /id="([^"]+)"/.exec(b.html)?.[1];
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(a.html).toContain(`url(#${idA})`);
    expect(a.html).not.toContain(`url(#g)`);
    expect(b.html).toContain(`url(#${idB})`);
  });

  it("never touches the text it was given", () => {
    const code = `<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
    buildSvgPreview(code);
    expect(code).toBe(`<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`);
  });
});

describe("buildSvgPreview — empty is not broken (RULE 4)", () => {
  it("reports why a document cannot be previewed", () => {
    expect(preview(null)).toMatchObject({ ok: false, html: "", error: "no SVG to preview" });
    expect(preview("   ")).toMatchObject({ ok: false, error: "no SVG to preview" });
    expect(preview("Here is your icon: sorry, no code.")).toMatchObject({ ok: false, error: "no SVG markup found" });
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"`)).toMatchObject({ ok: false, error: "not well-formed XML" });
    expect(preview(`<html><body><svg xmlns="${NS}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg></body></html>`))
      .toMatchObject({ ok: false, error: "root element is not <svg>" });
  });

  it("says so when there is no box to fit into", () => {
    const pct = preview(`<svg xmlns="${NS}" width="100%" height="100%"><path d="M2 2h20v20H2z"/></svg>`);
    expect(pct).toMatchObject({ ok: false, error: "no viewBox and no usable width/height" });
    expect(preview(`<svg xmlns="${NS}"><path d="M2 2h20v20H2z"/></svg>`).ok).toBe(false);
    expect(preview(`<svg xmlns="${NS}" viewBox="0 0 0 24"><path d="M2 2h20v20H2z"/></svg>`).ok).toBe(false);
  });
});

describe("previewTargetOf — one version for the preview and for Copy", () => {
  const source = svgSource("fog", { dir: "a", name: "fog_AI.png" });

  function version(v: number, svgPath: string, ok = true): SvgVersion {
    return {
      version: v, svgPath, status: "generated", review: "pending", prompt: "p", provider: "Requesty",
      model: "m", requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
      usage: { input: 1, output: 2, total: 3 },
      cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "", basis: "provider" },
      validation: { ok, errors: [], warnings: [], icons: 1 },
      batch: null, error: null, requestId: null,
    };
  }

  function rowWith(versions: SvgVersion[]): SvgRow {
    const meta: PairMeta = versions.reduce((acc, v) => withVersion(acc, v), pairMetaFor(source, []));
    return { source, meta, corrupt: false, newest: versions.at(-1) ?? null, approved: null, status: "generated", error: null, running: false };
  }

  it("points at the newest valid version's file and number", () => {
    const row = rowWith([version(1, "a/fog_AI.svg"), version(2, "a/fog_AI_v2.svg")]);
    expect(previewTargetOf(row)).toEqual({ version: 2, svgPath: "a/fog_AI_v2.svg" });
  });

  it("is null when there is nothing valid to preview or to copy", () => {
    expect(previewTargetOf(rowWith([]))).toBeNull();
    expect(previewTargetOf(rowWith([version(3, "")]))).toBeNull();
  });
});

describe("the preferred version drives preview, Copy and review (2026-10-05)", () => {
  const source = svgSource("fog", { dir: "a", name: "fog_AI.png" });

  function version(v: number, svgPath: string, ok = true): SvgVersion {
    return {
      version: v, svgPath, status: "generated", review: "pending", prompt: "p", provider: "Requesty",
      model: "m", requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
      usage: { input: 1, output: 2, total: 3 },
      cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "", basis: "provider" },
      validation: { ok, errors: [], warnings: [], icons: 1 },
      batch: null, error: null, requestId: null,
    };
  }

  /** A row exactly as a scan builds it, with the pair's own file. */
  function rowWith(versions: SvgVersion[], preferred: number | null): SvgRow {
    const withVersions = versions.reduce((acc, v) => withVersion(acc, v), pairMetaFor(source, []));
    return toRow(source, withPreference(withVersions, preferred), false);
  }

  it("previews the chosen version instead of the newest one", () => {
    const row = rowWith([version(1, "a/fog_AI.svg"), version(2, "a/fog_AI_v2.svg")], 1);
    expect(previewTargetOf(row)).toEqual({ version: 1, svgPath: "a/fog_AI.svg" });
    expect(isPreferredTarget(row)).toBe(true);
    expect(targetVersionOf(row)?.version).toBe(1);
  });

  it("falls back to the newest valid version when no choice was made", () => {
    const row = rowWith([version(1, "a/fog_AI.svg"), version(2, "a/fog_AI_v2.svg")], null);
    expect(previewTargetOf(row)).toEqual({ version: 2, svgPath: "a/fog_AI_v2.svg" });
    expect(isPreferredTarget(row)).toBe(false);
  });

  it("never previews a preferred version that stopped being valid (RULE 4)", () => {
    const row = rowWith([version(1, "a/fog_AI.svg", false), version(2, "a/fog_AI_v2.svg")], 1);
    expect(previewTargetOf(row)).toEqual({ version: 2, svgPath: "a/fog_AI_v2.svg" });
    expect(isPreferredTarget(row)).toBe(false);
  });

  it("keeps the choice when the version it names is not in the file", () => {
    const row = rowWith([version(1, "a/fog_AI.svg")], 7);
    expect(previewTargetOf(row)).toEqual({ version: 1, svgPath: "a/fog_AI.svg" });
  });
});
