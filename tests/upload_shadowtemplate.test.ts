// upload_shadowtemplate.test.ts — the user-editable SHADOW template (2026-11-08), set the same way as
// the badge's "Edit SVG template…": ANY complete vector SVG with a viewBox. It is validated by the
// badge's validator (so what passes also exports as SVG, JPEG and EPS), scaled to the shadow's width %
// of the icon with its own proportions, and placed centred below the icon at the gap %. The bundled
// shadow stays on its own path: the default's output is byte-identical to before the setting existed.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHADOW_TEMPLATE, readShadowTemplateSetting, SHADOW_TEMPLATE_MAX_LENGTH, validateShadowTemplate,
} from "../src/lib/upload/shadowtemplate";
import { appendUploadShadow, hoistAroundShadow } from "../src/lib/upload/shadow";
import { visibleBounds } from "../src/lib/upload/geom/bounds";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { CONVERTERS } from "../src/lib/upload/epsconv/registry";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { DEFAULT_UPLOAD_SETTINGS, normalizeSettings, parseOverrides } from "../src/lib/upload/settings";
import { settingsFingerprint } from "../src/lib/upload/settingsfingerprint";
import { DECORATION_FIELDS, fieldsOf } from "../src/lib/upload/decorations";
import { discreteSettingsChange } from "../src/upload/settingsgestures";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
/** The exact code the user pasted: a plain filled path, 1568 × 133. */
const USER = `<svg width="1568" height="133" viewBox="0 0 1568 133" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M783.586 132.874C1216.35 132.874 1567.17 103.129 1567.17 66.4368C1567.17 29.7447 1216.35 0 783.586 0C350.823 0 0 29.7447 0 66.4368C0 103.129 350.823 132.874 783.586 132.874Z" fill="#F5F5F5"/>
</svg>`;
/** The bounding-box gradient spelling. */
const BBOX = `<svg ${NS} viewBox="0 0 100 20"><ellipse cx="50" cy="10" rx="50" ry="10" fill="url(#g)" fill-opacity="0.5"/>`
  + `<defs><radialGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#00ff00" stop-opacity="0"/></radialGradient></defs></svg>`;
/** Several shapes, a group, a linear gradient and a stroke — "almost any SVG". */
const RICH = `<svg ${NS} viewBox="0 0 120 30"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs>`
  + `<g><rect x="5" y="5" width="60" height="10" rx="3" fill="url(#lg)"/><circle cx="90" cy="15" r="8" fill="#336699" fill-opacity="0.6"/><path d="M5 25H115" stroke="#0000ff" stroke-width="2" fill="none"/></g></svg>`;

describe("validateShadowTemplate — accepts any complete vector SVG, like the badge", () => {
  it("accepts the code the user pasted, and reads its proportions from the viewBox", () => {
    const r = validateShadowTemplate(USER);
    expect(r.ok, r.ok ? "" : r.detail).toBe(true);
    if (r.ok) expect(r.bounds).toEqual({ minX: 0, minY: 0, width: 1568, height: 133 });
  });

  it.each([["the bundled shadow", DEFAULT_SHADOW_TEMPLATE], ["a gradient ellipse", BBOX], ["shapes, a group, a gradient and a stroke", RICH]])("accepts %s", (_n, code) => {
    const r = validateShadowTemplate(code);
    expect(r.ok, r.ok ? "" : r.detail).toBe(true);
  });

  it("accepts a document without xmlns", () => {
    expect(validateShadowTemplate(USER.replace(` ${NS}`, "")).ok).toBe(true);
  });
});

describe("validateShadowTemplate — refuses what cannot be drawn, and says why", () => {
  const refused = (code: string): string => {
    const r = validateShadowTemplate(code);
    expect(r.ok).toBe(false);
    return r.ok ? "" : r.detail;
  };

  it("empty, oversize, malformed, DTD and processing instructions", () => {
    expect(refused("")).toContain("Paste");
    expect(refused("x".repeat(SHADOW_TEMPLATE_MAX_LENGTH + 1))).toContain("limit");
    expect(refused("<svg")).toContain("valid SVG");
    expect(refused('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>')).toContain("DTD");
    expect(refused('<?xml-stylesheet href="x.css"?><svg xmlns="http://www.w3.org/2000/svg"/>')).toContain("processing");
  });

  it("scripts, text, images, event handlers and external references", () => {
    expect(refused(USER.replace("</svg>", "<script>alert(1)</script></svg>"))).toContain("Unsupported");
    expect(refused(USER.replace("</svg>", "<text>x</text></svg>"))).toContain("Unsupported");
    expect(refused(USER.replace("</svg>", '<image href="https://x/y.png"/></svg>'))).toContain("Unsupported");
    expect(refused(USER.replace("<path", '<path onload="alert(1)"'))).toContain("attribute");
    expect(refused(USER.replace('fill="#F5F5F5"', 'fill="url(https://x/g)"'))).toContain("url(#id)");
  });

  it("no viewBox, geometry outside it, and a gradient the bake cannot re-map", () => {
    expect(refused(USER.replace('viewBox="0 0 1568 133"', ""))).toContain("viewBox");
    expect(refused(USER.replace('viewBox="0 0 1568 133"', 'viewBox="0 0 800 133"'))).toContain("inside its viewBox");
    expect(refused(BBOX.replace('<radialGradient id="g">', '<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="50" cy="10" r="50">'))).toContain("userSpaceOnUse");
  });
});

describe("readShadowTemplateSetting — persisted data costs only this field", () => {
  it("empty is the explicit bundled-template choice; junk and invalid code read as null", () => {
    expect(readShadowTemplateSetting("")).toBe("");
    for (const bad of [undefined, null, 5, {}, "<svg", USER.replace("</svg>", "<script/></svg>")]) expect(readShadowTemplateSetting(bad)).toBeNull();
  });

  it("valid code is stored canonical and stable; the bundled template itself reads back as the empty default", () => {
    const stored = readShadowTemplateSetting(USER);
    expect(stored).toContain("#F5F5F5");
    expect(readShadowTemplateSetting(stored)).toBe(stored);
    expect(readShadowTemplateSetting(DEFAULT_SHADOW_TEMPLATE)).toBe("");
  });
});

describe("appendUploadShadow — the bundled shadow is unchanged; a user's template is placed under the icon", () => {
  const icon = { minX: 100, minY: 100, width: 200, height: 160 };
  const run = (templateSvg?: string, existing = "") => {
    const doc = new DOMParser().parseFromString(`<svg ${NS} viewBox="0 0 400 400"><path d="M0 0h10"/>${existing}</svg>`, "image/svg+xml");
    const root = doc.documentElement;
    const shadow = appendUploadShadow(root, icon, { widthPct: 80, gapPct: 5, templateSvg });
    return { root, shadow, text: new XMLSerializer().serializeToString(doc) };
  };
  const boxOf = (group: Element) => {
    const only = new DOMParser().parseFromString(`<svg ${NS} viewBox="0 0 400 400"/>`, "image/svg+xml").documentElement;
    only.appendChild(only.ownerDocument.importNode(group, true));
    return visibleBounds(only, false)!.bounds;
  };

  it("the default is unchanged: no template, the empty setting and the bundled code give identical output", () => {
    const base = run().text;
    expect(run("").text).toBe(base);
    expect(base).toContain('stop-color="#1F1F1F"');
    expect(run().shadow!.nodeName).toBe("ellipse");
  });

  it("the user's code becomes a group behind the icon: width % of the icon, its own proportions, centred, gap % below", () => {
    const { root, shadow, text } = run(USER);
    expect(shadow!.nodeName).toBe("g");
    expect(root.firstElementChild).toBe(shadow); // behind the icon
    const box = boxOf(shadow!);
    expect(box.width).toBeCloseTo(160, 0); // 200 × 80 %
    expect(box.height).toBeCloseTo(160 * 133 / 1568, 0); // the viewBox proportions
    expect(box.minX + box.width / 2).toBeCloseTo(200, 0); // centred on the icon
    expect(box.minY).toBeCloseTo(100 + 160 + 8, 0); // below the icon: gap 5 % of its height
    expect(text).toContain("#F5F5F5");
  });

  it("gradients, groups and several shapes come along; ids are made unique against the document", () => {
    const { shadow, text } = run(RICH, '<defs><linearGradient id="lg"/></defs>');
    expect(shadow!.querySelectorAll("rect, circle, path").length).toBe(3);
    expect(text).toContain("#123456");
    expect(text).toContain("#abcdef");
    const ids = Array.from(new DOMParser().parseFromString(text, "image/svg+xml").querySelectorAll("[id]"), (e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it("an invalid template adds nothing (the caller reports it)", () => {
    const { shadow, root } = run("<svg");
    expect(shadow).toBeNull();
    expect(root.children.length).toBe(1);
  });
});

describe("hoistAroundShadow — the icon's stroke definition and the shadow's own never mix", () => {
  const strokeDoc = (shadowSvg: string) => {
    const doc = new DOMParser().parseFromString(`<svg ${NS} viewBox="0 0 400 400"><path d="M100 100h200v160H100z" stroke="#000" stroke-width="4" fill="none"/></svg>`, "image/svg+xml");
    const root = doc.documentElement;
    const shadow = appendUploadShadow(root, { minX: 98, minY: 98, width: 204, height: 164 }, { widthPct: 80, gapPct: 5, templateSvg: shadowSvg });
    return { root, shadow: shadow! };
  };

  it("the hoist does not see the shadow, which is put back in place with its OWN stroke", () => {
    const { root, shadow } = strokeDoc(RICH);
    let seen = -1;
    hoistAroundShadow(root, shadow, () => { seen = root.querySelectorAll("g").length; return null; });
    expect(seen).toBe(0); // lifted out during the hoist
    expect(root.firstElementChild).toBe(shadow); // …and back where it was
    expect(new XMLSerializer().serializeToString(root)).toMatch(/stroke="#0000ff"|stroke="#00f"/i);
  });

  it("a fill-only shadow is stroke-free whatever the icon hoists", () => {
    const { root, shadow } = strokeDoc(USER);
    hoistAroundShadow(root, shadow, () => { root.setAttribute("stroke", "#000"); return null; });
    expect(shadow.getAttribute("stroke")).toBe("none");
  });
});

describe("the setting: persisted, pinned per icon, fingerprinted only while the shadow is on", () => {
  it("is part of the shadow's decoration fields and its discrete undo gesture", () => {
    expect(DECORATION_FIELDS).toContain("shadowTemplateSvg");
    expect(fieldsOf("shadow")).toContain("shadowTemplateSvg");
    expect(discreteSettingsChange({}, { shadowTemplateSvg: USER })).toBe(true);
  });

  it("defaults empty; a stored valid template survives; an invalid one reads back as the default", () => {
    expect(DEFAULT_UPLOAD_SETTINGS.shadowTemplateSvg).toBe("");
    expect(normalizeSettings({ shadowTemplateSvg: USER }).shadowTemplateSvg).toContain("#F5F5F5");
    expect(normalizeSettings({ shadowTemplateSvg: "<svg" }).shadowTemplateSvg).toBe("");
    expect(normalizeSettings({}).shadowTemplateSvg).toBe("");
  });

  it("a per-icon override keeps a valid template and drops an invalid one", () => {
    expect(parseOverrides({ shadowTemplateSvg: USER }).shadowTemplateSvg).toContain("#F5F5F5");
    expect(parseOverrides({ shadowTemplateSvg: "" }).shadowTemplateSvg).toBe("");
    expect("shadowTemplateSvg" in parseOverrides({ shadowTemplateSvg: "<svg" })).toBe(false);
  });

  it("the export fingerprint moves with the template, but only while the shadow is on", () => {
    const on = { ...DEFAULT_UPLOAD_SETTINGS, shadowEnabled: true };
    const custom = readShadowTemplateSetting(USER) as string;
    expect(settingsFingerprint({ ...on, shadowTemplateSvg: custom })).not.toBe(settingsFingerprint(on));
    expect(settingsFingerprint({ ...on, shadowTemplateSvg: readShadowTemplateSetting(BBOX) as string })).not.toBe(settingsFingerprint({ ...on, shadowTemplateSvg: custom }));
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, shadowTemplateSvg: custom })).toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
  });
});

describe("the export pipeline uses the user's shadow", () => {
  const SOURCE = `<svg ${NS} viewBox="0 0 100 100" fill="none" stroke="#000" stroke-width="4"><path d="M20 20h60v60H20z"/></svg>`;
  const settings = (over: Record<string, unknown>) => ({ ...DEFAULT_UPLOAD_SETTINGS, shadowEnabled: true, includeEps: true, ...over }) as typeof DEFAULT_UPLOAD_SETTINGS;

  it.each([["the pasted path", USER, "#F5F5F5"], ["a gradient ellipse", BBOX, "#ff0000"], ["shapes + gradient + stroke", RICH, "#123456"]])(
    "%s reaches the shipped SVG, and its EPS passes the vector-only check", async (_n, code, marker) => {
      const out = prepareExportSvg(SOURCE, settings({ shadowTemplateSvg: readShadowTemplateSetting(code) as string }));
      expect(out.ok, out.ok ? "" : out.detail).toBe(true);
      if (!out.ok) return;
      expect(out.svg).toContain(marker);
      expect(out.svg).not.toContain("#1F1F1F");
      expect(out.svg).not.toContain("transform="); // no transform reaches the file
      const eps = await CONVERTERS.builtin.convert({ svg: out.svg, background: "#ffffff", title: "x.eps" }, {} as never);
      expect(eps.ok, eps.ok ? "" : JSON.stringify(eps)).toBe(true);
      if (eps.ok) expect(verifyEpsDocument(eps.eps).errors).toEqual([]);
    });

  it("the icon keeps its own stroke definition: a stroked shadow does not change it", () => {
    const without = prepareExportSvg(SOURCE, settings({ shadowEnabled: false }));
    const withBlue = prepareExportSvg(SOURCE, settings({ shadowTemplateSvg: readShadowTemplateSetting(RICH) as string }));
    expect(without.ok && withBlue.ok).toBe(true);
    if (!without.ok || !withBlue.ok) return;
    const rootStroke = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement.getAttribute("stroke");
    expect(rootStroke(withBlue.svg)).toBe(rootStroke(without.svg)); // the icon's hoisted stroke is untouched
    expect(withBlue.svg).toMatch(/stroke="#0000ff"|stroke="#00f"/i); // the shadow's own stroke is kept
  });

  it("the shadow sits behind the icon and inside the artboard (the fit measured it)", () => {
    const out = prepareExportSvg(SOURCE, settings({ shadowTemplateSvg: readShadowTemplateSetting(USER) as string }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const doc = new DOMParser().parseFromString(out.svg, "image/svg+xml");
    const board = doc.documentElement.getAttribute("viewBox")!.split(" ").map(Number);
    const all = visibleBounds(doc.documentElement, false)!.bounds;
    expect(all.minX).toBeGreaterThanOrEqual(board[0] - 0.01);
    expect(all.minY + all.height).toBeLessThanOrEqual(board[1] + board[3] + 0.01);
    const order = Array.from(doc.documentElement.children).map((e) => e.nodeName);
    expect(order.indexOf("g")).toBeLessThan(order.lastIndexOf("path")); // the shadow group comes before the icon path
  });

  it("the bundled shadow is what ships when no template is set (same bytes as before the setting existed)", () => {
    const a = prepareExportSvg(SOURCE, settings({}));
    const b = prepareExportSvg(SOURCE, settings({ shadowTemplateSvg: "" }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) { expect(a.svg).toBe(b.svg); expect(a.svg).toContain('stop-color="#1F1F1F"'); expect(a.svg).toContain("<ellipse"); }
  });

  it("a stored template that cannot be drawn fails the export honestly instead of dropping the shadow", () => {
    const out = prepareExportSvg(SOURCE, settings({ shadowTemplateSvg: "<svg" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.detail).toContain("shadow");
  });

  it("the shadow switched off ignores the template entirely", () => {
    const off = prepareExportSvg(SOURCE, settings({ shadowEnabled: false, shadowTemplateSvg: readShadowTemplateSetting(USER) as string }));
    expect(off.ok && !off.svg.includes("#F5F5F5")).toBe(true);
  });
});
