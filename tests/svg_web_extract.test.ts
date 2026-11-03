// A one-icon chat reply is a bare SVG (no title, no position): it belongs to
// the request's only icon. `<use>` copies are expanded into real elements so the
// saved file needs no id references (2026-11-03, ChatGPT mirrors halves).

import { describe, expect, it } from "vitest";
import { extractSvgBlocks, matchLoneBlock } from "../src/lib/svgextract";
import { expandUses } from "../src/lib/svguse";

const BARE = '<svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg>';

describe("matchLoneBlock", () => {
  const one = [{ position: 1, name: "icon-1_AI", relPath: "a/icon-1_AI.png" }];
  it("gives the only icon the reply's last SVG when nothing names it", () => {
    const m = matchLoneBlock(extractSvgBlocks(`Worked for 38s\n${BARE}`), one);
    expect(m.ok).toBe(true);
    expect(m.byPosition.get(1)).toBe(BARE);
  });
  it("prefers the explicit matcher when a title names the icon", () => {
    const titled = '<svg><title>icon-1_AI</title><path d="M1 1"/></svg>';
    expect(matchLoneBlock(extractSvgBlocks(`${BARE}\n${titled}`), one).byPosition.get(1)).toBe(titled);
  });
  it("stays missing with no SVG at all, and never guesses for a batch", () => {
    expect(matchLoneBlock([], one).missing).toEqual([1]);
    const two = [{ position: 1, name: "a", relPath: "a.png" }, { position: 2, name: "b", relPath: "b.png" }];
    expect(matchLoneBlock(extractSvgBlocks(BARE), two).byPosition.size).toBe(0);
  });
});

describe("expandUses", () => {
  it("replaces a <use> with a transformed copy of its target, without the id", () => {
    const code = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="a" d="M10 10L40 40" stroke="#000"/>'
      + '<use href="#a" transform="matrix(-1 0 0 1 100 0)"/></svg>';
    const out = expandUses(code);
    expect(out).not.toContain("<use");
    expect(out).toContain('<g transform="matrix(-1 0 0 1 100 0)"><path d="M10 10L40 40" stroke="#000"');
    expect(out.match(/<path/g)).toHaveLength(2);
  });
  it("folds x/y into a translate and reads the legacy xlink:href", () => {
    const code = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><circle id="c" r="2"/><use xlink:href="#c" x="5" y="6"/></svg>';
    const out = expandUses(code);
    expect(out).toContain('<g transform="translate(5 6)"><circle r="2"');
  });
  it("leaves code without <use>, or with a dangling one, unchanged", () => {
    expect(expandUses(BARE)).toBe(BARE);
    const dangling = '<svg xmlns="http://www.w3.org/2000/svg"><use href="#nope"/></svg>';
    expect(expandUses(dangling)).toBe(dangling);
    expect(expandUses("<svg><broken")).toBe("<svg><broken");
  });
});
