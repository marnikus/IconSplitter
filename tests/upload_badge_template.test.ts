import { beforeEach, describe, expect, it } from "vitest";
import { validateBadgeTemplate } from "../src/lib/upload/badgetemplate";
import { appendCornerBadge } from "../src/lib/upload/cornerbadge";
import { DEFAULT_UPLOAD_SETTINGS, normalizeSettings, overridesEqual, parseOverrides } from "../src/lib/upload/settings";
import { settingsFingerprint } from "../src/lib/upload/settingsfingerprint";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { writeEps } from "../src/lib/upload/eps";
import { verifyEps } from "../src/lib/upload/eps";
import { insideArtboard } from "../src/lib/upload/place";
import { loadUploadSettings, saveUploadSettings } from "../src/upload/settingsstore";
import { rowSettings } from "../src/lib/upload/decorations";
import { discreteSettingsChange } from "../src/upload/settingsgestures";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const CUSTOM = `<svg ${NS} viewBox="10 20 80 40"><g fill="#ff0000"><rect x="10" y="20" width="80" height="40"/></g></svg>`;
const ICON = `<svg ${NS} viewBox="0 0 100 100"><path d="M20 20h60v60H20z" fill="#123456"/></svg>`;
const GRADIENT = `<svg ${NS} viewBox="0 0 100 50"><defs><linearGradient id="a"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="100" height="50" fill="url(#a)"/></svg>`;
const parse = (s: string) => new DOMParser().parseFromString(s, "image/svg+xml").documentElement;

beforeEach(() => localStorage.clear());

describe("user badge template validation", () => {
  it("preserves class specificity and source order across simple stylesheet blocks", () => {
    const result = validateBadgeTemplate(CUSTOM.replace('<g fill="#ff0000">', '<style>.badge {fill: blue;}</style><style>g {fill:red;}</style><g class="badge">'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.root.querySelector('g')?.getAttribute('fill')).toBe('blue');
  });

  it("preserves inline paint precedence over stylesheet rules", () => {
    const result = validateBadgeTemplate(CUSTOM.replace('<g fill="#ff0000">', '<style>.badge {fill: red;}</style><g class="badge" style="fill:blue">'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.root.querySelector('g')?.getAttribute('fill')).toBe('blue');
  });

  it("accepts and canonicalizes arbitrary vector dimensions, basic shapes, groups and paint-only styles", () => {
    expect(validateBadgeTemplate(CUSTOM)).toMatchObject({ ok: true, bounds: { minX: 10, minY: 20, width: 80, height: 40 } });
    const result = validateBadgeTemplate(`<svg viewBox="0 0 24 24"><g style="fill:blue"><circle cx="12" cy="12" r="10"/></g></svg>`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.svg).not.toContain("style=");
    expect(result.svg).toContain('fill="blue"');
    expect(validateBadgeTemplate(GRADIENT).ok).toBe(true);
    const styled = validateBadgeTemplate(CUSTOM.replace('<g fill="#ff0000">', '<style>.badge {fill: red;}</style><g class="badge">'));
    expect(styled.ok).toBe(true);
    if (styled.ok) expect(styled.svg).toContain('fill="red"');
  });

  it.each([
    "", "<svg", `<html><svg/></html>`, `<svg ${NS}/>` ,
    `<svg ${NS} viewBox="0 0 0 40"><path d="M0 0h20v20z"/></svg>`,
    CUSTOM.replace('<g fill=', '<g onclick="alert(1)" fill='),
    CUSTOM.replace('<g fill=', '<g onload="alert(1)" fill='),
    CUSTOM.replace('</svg>', '<script>alert(1)</script></svg>'),
    CUSTOM.replace('<g fill=', '<g id="duplicate" fill=').replace('<rect x=', '<rect id="duplicate" x='),
    CUSTOM.replace('</svg>', '<foreignObject><div/></foreignObject></svg>'),
    CUSTOM.replace('</svg>', '<image href="https://example.invalid/a.png"/></svg>'),
    CUSTOM.replace('</svg>', '<animate attributeName="fill" values="red;blue"/></svg>'),
    CUSTOM.replace('</svg>', '<text x="10" y="30">Hello</text></svg>'),
    CUSTOM.replace('#ff0000', 'url(https://example.invalid/a.svg#paint)'),
    CUSTOM.replace('#ff0000', 'url(&#x68;ttps://example.invalid/a.svg#paint)'),
    CUSTOM.replace('<g fill=', '<g style="background:url(https://example.invalid/a)" fill='),
    CUSTOM.replace('<g fill=', '<g filter="url(#x)" fill='),
    CUSTOM.replace('<g fill=', '<g mystery="1" fill='),
    `<!DOCTYPE svg [<!ENTITY test "bad">]>${CUSTOM}`,
    `<?xml-stylesheet href="https://example.invalid/paint.css"?>${CUSTOM}`,
    CUSTOM.replace('xmlns="http://www.w3.org/2000/svg"', 'xmlns="http://example.invalid/svg"'),
    CUSTOM.replace('<g fill=', '<svg fill=').replace('</g>', '</svg>'),
    CUSTOM.replace('width="80"', 'width="800"'),
    CUSTOM.replace('viewBox="10 20 80 40"', 'viewBox="NaN 20 80 40"'),
    CUSTOM.replace('<g fill=', '<g opacity="0.5" fill='),
    GRADIENT.replace('<linearGradient id="a">', '<linearGradient id="a" href="https://example.invalid/a">'),
    GRADIENT.replace('id="a"', 'id="a" gradientUnits="userSpaceOnUse"'),
    CUSTOM.replace('viewBox=', 'unknown:field="x" viewBox='),
    CUSTOM.replace('</svg>', '<style>@import url(https://example.invalid/x);</style></svg>'),
  ])("refuses unsafe, malformed, clipped or unsupported input without silently dropping it: %s", (svg) => {
    const result = validateBadgeTemplate(svg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail.length).toBeGreaterThan(5);
  });

  it("bounds source size, node count and nesting", () => {
    expect(validateBadgeTemplate(CUSTOM + ' '.repeat(200_001)).ok).toBe(false);
    expect(validateBadgeTemplate(`<svg ${NS} viewBox="0 0 100 100">${'<g>'.repeat(40)}<rect width="10" height="10"/>${'</g>'.repeat(40)}</svg>`).ok).toBe(false);
    expect(validateBadgeTemplate(`<svg ${NS} viewBox="0 0 100 100">${'<rect width="10" height="10"/>'.repeat(2001)}</svg>`).ok).toBe(false);
  });
});

describe("custom badge persisted settings and shared output", () => {
  it("round-trips inherited, applied and locally pinned templates without enabling unchecked badges", () => {
    const valid = validateBadgeTemplate(CUSTOM);
    if (!valid.ok) throw new Error(valid.detail);
    const defaults = normalizeSettings({ ...DEFAULT_UPLOAD_SETTINGS, badgeTemplateSvg: CUSTOM, badgeEnabled: true });
    expect(defaults.badgeTemplateSvg).toBe(valid.svg);
    expect(defaults.badgeEnabled).toBe(false);
    expect(parseOverrides({ badgeTemplateSvg: '<svg broken', badgeWidthPct: 25 })).toEqual({ badgeWidthPct: 25 });
    expect(normalizeSettings({ badgeTemplateSvg: '<svg broken' }).badgeTemplateSvg).toBe('');
    expect(parseOverrides({ badgeTemplateSvg: '' })).toEqual({ badgeTemplateSvg: '' });
    expect(parseOverrides({ badgeTemplateSvg: 5 })).toEqual({});
    saveUploadSettings({ defaults, overrides: { one: { badgeTemplateSvg: GRADIENT } }, applied: { one: { badgeEnabled: true }, two: { badgeEnabled: true, badgeTemplateSvg: CUSTOM } } });
    const state = loadUploadSettings();
    expect(state.overrides.one.badgeTemplateSvg).toContain('linearGradient');
    expect(state.applied.two.badgeTemplateSvg).toBe(valid.svg);
    expect(rowSettings(state.defaults, 'unchecked', state.overrides, state.applied).badgeEnabled).toBe(false);
    expect(rowSettings(state.defaults, 'one', {}, state.applied).badgeTemplateSvg).toBe(valid.svg); // reset inherits, badge stays
    expect(overridesEqual({ badgeTemplateSvg: '' }, { badgeTemplateSvg: valid.svg })).toBe(false);
    expect(discreteSettingsChange({ badgeTemplateSvg: '' }, { badgeTemplateSvg: valid.svg })).toBe(true);
  });

  it("hashes the chosen template only when enabled; empty default preserves legacy fingerprints", () => {
    const off = DEFAULT_UPLOAD_SETTINGS;
    expect(settingsFingerprint({ ...off, badgeTemplateSvg: CUSTOM })).toBe(settingsFingerprint(off));
    const on = { ...off, badgeEnabled: true };
    expect(settingsFingerprint({ ...on, badgeTemplateSvg: '' })).toBe(settingsFingerprint(on));
    expect(settingsFingerprint({ ...on, badgeTemplateSvg: CUSTOM })).not.toBe(settingsFingerprint(on));
    expect(settingsFingerprint({ ...on, badgeTemplateSvg: CUSTOM })).not.toBe(settingsFingerprint({ ...on, badgeTemplateSvg: GRADIENT }));
  });

  it.each(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)("places the replacement at %s with correct aspect/insets and unchanged icon fit", (corner) => {
    const settings = { ...DEFAULT_UPLOAD_SETTINGS, badgeEnabled: true, badgeTemplateSvg: CUSTOM, badgeCorner: corner,
      artboard: { mode: 'custom' as const, size: 512, width: 400, height: 200 } };
    const result = prepareExportSvg(ICON, settings);
    const off = prepareExportSvg(ICON, { ...settings, badgeEnabled: false });
    if (!result.ok || !off.ok) throw new Error(JSON.stringify(result));
    expect(result.fit).toEqual(off.fit);
    const root = parse(result.svg), group = root.lastElementChild!;
    expect(group.nodeName).toBe('g');
    expect(root.querySelectorAll('path')).toHaveLength(1); // no seven-path default badge
    const rect = group.querySelector('rect')!;
    expect(rect.getAttribute('width')).toBe('160');
    expect(rect.getAttribute('height')).toBe('80');
    expect(Number(rect.getAttribute('x'))).toBe(corner.endsWith('left') ? 12 : 228);
    expect(Number(rect.getAttribute('y'))).toBe(corner.startsWith('top') ? 6 : 114);
    expect(insideArtboard(root)).toBe(true);
    expect(writeEps(result.svg, '#ffffff')).toMatchObject({ ok: true });
  });

  it("preserves gradients with collision-free IDs and native vector EPS", () => {
    const result = prepareExportSvg(ICON.replace('fill="#123456"', 'id="a" fill="#123456"'), {
      ...DEFAULT_UPLOAD_SETTINGS, badgeEnabled: true, badgeTemplateSvg: GRADIENT, shadowEnabled: true,
    });
    if (!result.ok) throw new Error(result.detail);
    const ids = Array.from(parse(result.svg).querySelectorAll('[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    const eps = writeEps(result.svg, '#ffffff');
    if (!eps.ok) throw new Error(eps.reason);
    expect(eps.eps).toContain('shfill');
    expect(verifyEps(eps.eps).ok).toBe(true);
  });

  it("scales strokes, obeys endpoint/expansion policies and shields fills from artwork paint inheritance", () => {
    const custom = `<svg ${NS} viewBox="0 0 100 50"><rect x="10" y="10" width="10" height="10"/><path d="M10 30h80" fill="none" stroke="blue" stroke-width="2" stroke-linecap="square"/></svg>`;
    for (const expandStrokes of [false, true]) {
      const result = prepareExportSvg(ICON, { ...DEFAULT_UPLOAD_SETTINGS, badgeEnabled: true, badgeTemplateSvg: custom,
        strokeLinecap: 'round', expandStrokes, strokeColor: '#00ff00', strokePx: 5 });
      if (!result.ok) throw new Error(result.detail);
      const group = parse(result.svg).lastElementChild!;
      expect(group.getAttribute('fill')).toBe('black');
      expect(group.querySelectorAll('[transform]')).toHaveLength(0);
      if (expandStrokes) {
        expect(result.strokesExpanded).toBe(1);
        expect(group.querySelector('path')?.getAttribute('fill')).toBe('blue');
      } else {
        expect(group.querySelector('path')?.getAttribute('stroke-linecap')).toBe('round');
      }
      expect(writeEps(result.svg, '#ffffff').ok).toBe(true);
    }
  });

  it("refuses broken/custom no-fit input atomically and does not validate it while disabled", () => {
    const root = parse(ICON), before = root.outerHTML;
    const base = { corner: 'bottom-right' as const, widthPct: 40, offsetXPct: 3, offsetYPct: 3 };
    expect(appendCornerBadge(root, { width: 100, height: 100 }, { ...base, templateSvg: '<svg broken' }).ok).toBe(false);
    expect(root.outerHTML).toBe(before);
    expect(appendCornerBadge(root, { width: 100, height: 100 }, { ...base, templateSvg: CUSTOM, offsetXPct: 100 }).ok).toBe(false);
    expect(root.outerHTML).toBe(before);
    expect(prepareExportSvg(ICON, { ...DEFAULT_UPLOAD_SETTINGS, badgeTemplateSvg: '<svg broken', badgeEnabled: false }).ok).toBe(true);
  });
});
