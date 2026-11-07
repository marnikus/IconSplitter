// @vitest-environment node
// builder_meta.test.ts — P6: the sheet-metadata request and the record it produces.
//
// Q2 (2026-11-07) is the rule this file enforces: the builder does NOT have its own
// metadata policy. The prompt, the parser, the validator and the tag rules are the
// ones "SVG to upload" already ships, imported — so an answer that upload would
// reject is rejected here for exactly the same reason, and the two tabs can never
// drift apart.
//
// Q1 is the other half: NO image is sent. The disclosed input is the sheet's own SVG
// source and the prompt, as two text parts — and when the source is too long it is
// replaced by a digest that the confirmation dialog announces, never a silent swap.

import { describe, expect, it } from "vitest";
import {
  SVG_DISCLOSURE_MAX_CHARS, buildSheetMetaRequest, compactSheetSource, digestOf,
  sheetMetaFingerprint, digestSourceOf,
} from "../src/lib/builder/metarequest";
import { DEFAULT_METADATA_PROMPT, validateMetadata } from "../src/lib/upload/meta";
import { parseMetaRecord, serializeMetaRecord, emptyMetaRecord, staleOf } from "../src/lib/builder/metastore";

const SHEET = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800">
  <rect x="0" y="0" width="1000" height="800" fill="#f6f4ee"/>
  <g data-layer="icons">
    <g data-cell="0" data-icon-id="a"><svg x="10" y="10" width="120" height="120" viewBox="0 0 24 24"><path d="M0 0h1"/></svg></g>
  </g>
</svg>`;

const args = (over: Partial<Parameters<typeof buildSheetMetaRequest>[0]> = {}) => ({
  prompt: DEFAULT_METADATA_PROMPT,
  sheetSvg: SHEET,
  icons: [{ id: "a", name: "Pot", viewBox: "0 0 24 24", paths: 1, tags: ["kitchen"] }],
  title: "Kitchen",
  subtitle: "Warm tools",
  config: { width: 1000, height: 800, columns: 4, rows: 3 },
  ...over,
});

describe("compactSheetSource — the characters actually sent", () => {
  it("drops the XML prolog and collapses inter-tag whitespace", () => {
    const out = compactSheetSource(`<?xml version="1.0"?>\n<svg a="1">\n   <g>\n      <path/>\n   </g>\n</svg>`);
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("\n");
    expect(out).toContain("<g><path/></g>");
  });

  it("leaves the document's own structure intact", () => {
    const out = compactSheetSource(SHEET);
    expect(out).toContain('data-icon-id="a"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out.startsWith("<svg")).toBe(true);
    expect(out.endsWith("</svg>")).toBe(true);
  });

  it("is stable: compacting twice changes nothing", () => {
    const once = compactSheetSource(SHEET);
    expect(compactSheetSource(once)).toBe(once);
  });
});

describe("the request body — text only, no image (Q1)", () => {
  it("carries exactly two text parts and nothing else", () => {
    const req = buildSheetMetaRequest(args());
    const parts = req.body.contents[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[0].text).toBe(DEFAULT_METADATA_PROMPT);
    expect(Object.keys(parts[1])).toEqual(["text"]);
    expect(JSON.stringify(req.body)).not.toContain("inlineData");
    expect(JSON.stringify(req.body)).not.toContain("data:");
    expect(JSON.stringify(req.body)).not.toContain("base64");
  });

  it("the second part names the input honestly instead of showing a picture", () => {
    const req = buildSheetMetaRequest(args());
    const text = req.body.contents[0].parts[1].text;
    expect(text).toContain("Sheet SVG source");
    expect(text).toContain("1 icon");
    expect(text).toContain("composed by the user");
    expect(text).toContain("<svg");
  });

  it("the prompt sent is the effective one, verbatim", () => {
    const req = buildSheetMetaRequest(args({ prompt: "my own prompt" }));
    expect(req.body.contents[0].parts[0].text).toBe("my own prompt");
  });
});

describe("the disclosure the dialog shows", () => {
  it("states the mode, the character count and the icon count", () => {
    const req = buildSheetMetaRequest(args());
    expect(req.disclosure.mode).toBe("svg");
    expect(req.disclosure.icons).toBe(1);
    expect(req.disclosure.chars).toBe(compactSheetSource(SHEET).length);
    expect(req.disclosure.lines.join(" ")).toContain("1 icon");
  });

  it("says in one line that the artwork is source code, not an image", () => {
    const said = buildSheetMetaRequest(args()).disclosure.lines.join("\n");
    expect(said).toContain("SVG source");
    // Stated as a negation so nobody can read it as "an image goes to the provider".
    expect(said).toContain("No image is sent");
  });
});

describe("over the cap — a digest, and the dialog says so", () => {
  it("switches to digest mode rather than truncating the document mid-tag", () => {
    const huge = SHEET.replace("</g>", `${"<rect/>".repeat(SVG_DISCLOSURE_MAX_CHARS / 4)}</g>`);
    const req = buildSheetMetaRequest(args({ sheetSvg: huge }));
    expect(req.disclosure.mode).toBe("digest");
    const text = req.body.contents[0].parts[1].text;
    expect(text).not.toContain("</svg>"); // no half a document
    expect(text).toContain("too long");
    expect(req.disclosure.chars).toBe(text.length);
  });

  it("the digest describes the sheet structurally, deterministically", () => {
    const a = digestSourceOf(args());
    const b = digestSourceOf(args());
    expect(a).toBe(b);
    expect(a).toContain("1000×800");
    expect(a).toContain("4×3");
    expect(a).toContain("Pot");
    expect(a).toContain("kitchen");
    expect(digestOf(args())).toMatch(/^[0-9a-f]{8}$/);
  });

  it("the digest changes when the sheet's content changes", () => {
    const one = digestOf(args());
    const two = digestOf(args({ icons: [{ id: "b", name: "Pan", viewBox: "0 0 24 24", paths: 2, tags: [] }] }));
    expect(one).not.toBe(two);
  });
});

describe("the fingerprint binds a record to the exact sheet (stale, never current)", () => {
  it("is stable for the same sheet", () => {
    expect(sheetMetaFingerprint(args())).toBe(sheetMetaFingerprint(args()));
  });

  it("changes when a slot's icon changes", () => {
    const before = sheetMetaFingerprint(args());
    const after = sheetMetaFingerprint(args({ icons: [{ id: "b", name: "Pot", viewBox: "0 0 24 24", paths: 1, tags: ["kitchen"] }] }));
    expect(after).not.toBe(before);
  });

  it("changes when the title changes, and when the grid changes", () => {
    const base = sheetMetaFingerprint(args());
    expect(sheetMetaFingerprint(args({ title: "Bathroom" }))).not.toBe(base);
    expect(sheetMetaFingerprint(args({ config: { width: 1000, height: 800, columns: 3, rows: 4 } }))).not.toBe(base);
  });

  it("does NOT change for a redraw that describes the same thing", () => {
    const base = sheetMetaFingerprint(args());
    // Different whitespace in the source: the same sheet, so the same fingerprint —
    // a fingerprint that moved on formatting would mark every record stale.
    expect(sheetMetaFingerprint(args({ sheetSvg: compactSheetSource(SHEET) }))).toBe(base);
  });

  it("a record is stale exactly when the sheet moved on", () => {
    const fingerprint = sheetMetaFingerprint(args());
    const record = { ...emptyMetaRecord(), state: "generated" as const, fingerprint };
    expect(staleOf(record, fingerprint)).toBe(false);
    expect(staleOf(record, sheetMetaFingerprint(args({ title: "Other" })))).toBe(true);
  });
});

describe("validation is upload's, not a builder copy (Q2)", () => {
  it("accepts an answer upload would accept", () => {
    const meta = {
      title: "Kitchen tools drawn as simple line icons",
      description: "A calm set of kitchen tools drawn as editable line icons",
      tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "kitchen", "tool", "calm", "simple"],
    };
    expect(validateMetadata(meta).ok).toBe(true);
  });

  it("rejects a short title, and the reason is upload's own words", () => {
    const bad = { title: "Kitchen", description: "A calm set of kitchen tools drawn as icons", tags: [] };
    const result = validateMetadata(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("at least 5 words");
  });
});

describe("the stored record — validated on read, never the request body", () => {
  it("round-trips through its own JSON", () => {
    const record = { ...emptyMetaRecord(), state: "accepted" as const, title: "Kitchen", fingerprint: "abcd1234" };
    expect(parseMetaRecord(JSON.parse(serializeMetaRecord(record)))).toEqual(record);
  });

  it("a corrupt payload costs the record, not the app", () => {
    expect(parseMetaRecord(null)).toBeNull();
    expect(parseMetaRecord({ v: 1, record: { state: "nonsense" } })).toBeNull();
    expect(parseMetaRecord({ v: 1, record: { state: "generated", title: 5 } })).toBeNull();
  });

  it("never stores the sheet source or anything secret", () => {
    const fields = Object.keys(emptyMetaRecord());
    expect(fields).not.toContain("svg");
    expect(fields).not.toContain("body");
    expect(fields.join(" ")).not.toMatch(/key|secret/i);
  });
});
