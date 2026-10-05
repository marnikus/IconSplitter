// RULE 8 — extraction, validation/security, icon counting, versioning + pair-file
// parsing, the exact request payload and every provider failure mode execute
// for real. happy-dom supplies the real DOMParser, so the security gate is
// tested against real XML, not a regex stand-in.
import { describe, expect, it } from "vitest";
import { extractSvgBlocks, matchBlocks, readHeadPosition, readTitle, sameName, trimSvg } from "../src/lib/svgextract";
import { parseSvg, svgDataUrl, validateSvg } from "../src/lib/svgvalidate";
import { countIcons } from "../src/lib/svgicons";
import {
  approvedVersion, newestValid, nextVersion,
  svgFileName, svgStem, tallyReviews, versionOfFileName,
} from "../src/lib/svgfile";
import { metaFileName } from "../src/lib/pairmeta";
import type { SvgVersion } from "../src/lib/svgmodel";
import {
  newPairMeta, parsePairMeta, serializePairMeta, withVersion, type PairMeta,
} from "../src/lib/pairmeta";
import { classifyHttp, classifyTransport, readContent, readRetryAfterMs, readUsage } from "../src/lib/svgrequest";
import { allocateUsage, fmtCost, fmtTokens, sumUsage, usageLine } from "../src/lib/svgusage";
import { batchManifest } from "../src/lib/svgbatch";

const svg = (inner: string, title?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">${title ? `<title>${title}</title>` : ""}${inner}</svg>`;

const icon = `<g><path d="M0 0h10v10z"/></g>`;
const fourIcons = `<g>${icon}</g><g>${icon}</g><g>${icon}</g><g>${icon}</g>`;

const manifest = batchManifest([
  { position: 1, sourceId: "pair_1", name: "icon-one_AI", relPath: "a/icon-one_AI.png", fingerprint: "1:1" },
  { position: 2, sourceId: "pair_2", name: "icon-two_AI", relPath: "a/icon-two_AI.png", fingerprint: "2:1" },
]);

describe("svgextract", () => {
  it("reads fenced code blocks and the position each heading declares", () => {
    const text = `Here you go:\n\n1) first\n\`\`\`svg\n${svg(icon, "icon-one_AI")}\n\`\`\`\n\n2) second\n\`\`\`\n${svg(icon, "icon-two_AI")}\n\`\`\`\n`;
    const blocks = extractSvgBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].position).toBe(1);
    expect(blocks[1].position).toBe(2);
    expect(blocks[0].title).toBe("icon-one_AI");
    expect(blocks[0].code.startsWith("<svg")).toBe(true);
  });

  it("falls back to raw markup when the answer has no fences", () => {
    const blocks = extractSvgBlocks(`${svg(icon)} some prose ${svg(icon)}`);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.position === null)).toBe(true);
  });

  it("keeps only the SVG document, dropping surrounding prose", () => {
    const block = `Sure!\n${svg(icon)}\nHope that helps.`;
    expect(trimSvg(block)).toBe(svg(icon));
    expect(trimSvg("no markup")).toBe("");
    expect(extractSvgBlocks("```\nnot svg\n```")).toEqual([]);
    expect(readHeadPosition("blah\nPosition 3: ")).toBe(3);
    expect(readHeadPosition("nothing here")).toBeNull();
    expect(readTitle(svg(icon, "named_AI"))).toBe("named_AI");
    expect(readTitle(svg(icon))).toBeNull();
    expect(sameName("Icon-One_AI", "icon-one_ai.svg")).toBe(true);
    expect(sameName("a", "b")).toBe(false);
  });

  it("matches by SVG title first and never shifts a later result", () => {
    const text = `\`\`\`svg\n${svg(icon, "icon-two_AI")}\n\`\`\`\n\`\`\`svg\n${svg(icon, "icon-one_AI")}\n\`\`\``;
    const out = matchBlocks(extractSvgBlocks(text), manifest);
    expect(out.ok).toBe(true);
    expect([...out.byPosition.keys()]).toEqual([2, 1]);
    expect(out.byPosition.get(1)).toContain("icon-one_AI");
  });

  it("falls back to declared positions when there are no titles", () => {
    const text = `1)\n\`\`\`svg\n${svg(icon)}\n\`\`\`\n2)\n\`\`\`svg\n${svg(icon)}\n\`\`\``;
    expect(matchBlocks(extractSvgBlocks(text), manifest).ok).toBe(true);
  });

  it("rejects duplicates, unknown names and out-of-range positions", () => {
    const dup = `1)\n\`\`\`svg\n${svg(icon, "icon-one_AI")}\n\`\`\`\n1)\n\`\`\`svg\n${svg(icon)}\n\`\`\``;
    const out = matchBlocks(extractSvgBlocks(dup), manifest);
    expect(out.ok).toBe(false);
    expect(out.problems.join(" ")).toContain("duplicate");
    expect(out.missing).toEqual([2]);

    const unknown = matchBlocks(extractSvgBlocks(`\`\`\`svg\n${svg(icon, "nope_AI")}\n\`\`\``), manifest);
    expect(unknown.ok).toBe(false);
    expect(unknown.byPosition.size).toBe(0);
    expect(unknown.problems.join(" ")).toContain("unmatched");

    const range = matchBlocks(extractSvgBlocks(`9)\n\`\`\`svg\n${svg(icon)}\n\`\`\``), manifest);
    expect(range.ok).toBe(false);
    expect(range.byPosition.size).toBe(0);
  });
});

describe("svgvalidate", () => {
  it("accepts a well-formed four-icon document", () => {
    const out = validateSvg(svg(fourIcons));
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
  });

  it("rejects empty, truncated, non-SVG and malformed payloads", () => {
    expect(validateSvg("").ok).toBe(false);
    expect(validateSvg("I made you four icons!").ok).toBe(false);
    expect(validateSvg("<svg viewBox='0 0 1 1'><path d='M0 0'").ok).toBe(false);
    expect(validateSvg(`${svg(icon)}${svg(icon)}`).errors).toContain("not well-formed XML");
    const nested = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${svg(icon)}</svg>`;
    expect(validateSvg(nested).errors).toContain("more than one <svg> root");
    expect(parseSvg("<html><body>x</body></html>").doc).not.toBeNull();
    expect(validateSvg("<html><body>x</body></html>").ok).toBe(false);
  });

  it("rejects scripts, event handlers, remote URLs and javascript: URLs", () => {
    expect(validateSvg(svg(`<script>alert(1)</script>${icon}`)).errors).toContain("unsafe <script> element");
    expect(validateSvg(svg(`<path d="M0 0" onclick="alert(1)"/>`)).errors.join(" ")).toContain("event handler");
    expect(validateSvg(svg(`<image href="https://evil.example/x.png" width="10" height="10"/>`)).errors.join(" ")).toContain("external URL");
    expect(validateSvg(svg(`<a href="javascript:alert(1)"><path d="M0 0"/></a>`)).errors.join(" ")).toContain("javascript:");
    expect(validateSvg(svg(`<path d="M0 0" xlink:href="#frag"/>`)).ok).toBe(true);
  });

  it("requires dimensions and renderable geometry", () => {
    expect(validateSvg(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`).errors).toContain("no viewBox and no usable width/height");
    expect(validateSvg(`<svg viewBox="0 0 10 10"></svg>`).errors).toContain("no renderable paths or shapes");
    expect(validateSvg(`<svg width="10" height="10"><path d="M0 0h1"/></svg>`).ok).toBe(true);
    expect(validateSvg(`<svg viewBox="bogus"><path d="M0 0h1"/></svg>`).ok).toBe(false);
  });

  it("warns about prose inside the document but still validates the markup", () => {
    const out = validateSvg(`<svg viewBox="0 0 10 10">here are your icons${icon}</svg>`);
    expect(out.ok).toBe(true);
    expect(out.warnings.join(" ")).toContain("text outside");
    expect(svgDataUrl("<svg/>")).toContain("data:image/svg+xml");
  });
});

describe("svgicons", () => {
  const doc = (code: string) => parseSvg(code).doc as Document;

  it("counts four icon groups confidently", () => {
    const out = countIcons(doc(svg(fourIcons)));
    expect(out).toEqual({ icons: 4, confident: true, note: "4 icons detected" });
  });

  it("warns when the icon count cannot be trusted", () => {
    const three = countIcons(doc(svg(`<g>${icon}</g><g>${icon}</g><g>${icon}</g>`)));
    expect(three.confident).toBe(false);
    expect(three.icons).toBe(3);
    expect(three.note).toContain("expected 4");
    const flat = countIcons(doc(svg("<path d='M0 0'/><path d='M1 1'/><path d='M2 2'/><path d='M3 3'/>")));
    expect(flat).toEqual({ icons: 4, confident: true, note: "4 icons detected" });
    expect(countIcons(doc(svg("<defs><linearGradient/></defs>"))).icons).toBe(0);
  });
});

/** The pair file these naming tests write beside `a/x_AI.png`. */
function file(): PairMeta {
  return newPairMeta({
    id: "pair_x", base: "x", suffix: "", dirPath: "a",
    ai: { relPath: "a/x_AI.png", name: "x_AI.png", fingerprint: "1:1" }, source: null,
  });
}

function rec(version: number, over: Partial<SvgVersion> = {}): SvgVersion {
  return {
    version, svgPath: `a/icon_AI_v${version}.svg`, status: "generated", review: "pending",
    prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol", requestedAt: "2026-10-01T10:00:00.000Z",
    completedAt: "2026-10-01T10:00:09.000Z",
    usage: { input: 100, output: 200, total: 300 },
    cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "requesty-2026-10-01", basis: "provider" },
    validation: { ok: true, errors: [], warnings: [], icons: 4 }, batch: null, error: null, requestId: null,
    ...over,
  };
}

describe("svgfile", () => {
  it("names the base, v2 and v3 files beside the AI image", () => {
    expect(svgStem("fog_architecture_041_AI.png")).toBe("fog_architecture_041_AI");
    expect(metaFileName("fog_architecture_041_AI.png")).toBe("fog_architecture_041_AI.svg.json");
    expect(svgFileName("icon_AI", 1)).toBe("icon_AI.svg");
    expect(svgFileName("icon_AI", 2)).toBe("icon_AI_v2.svg");
    expect(svgFileName("icon_AI", 3)).toBe("icon_AI_v3.svg");
    expect(versionOfFileName("icon_AI.svg", "icon_AI")).toBe(1);
    expect(versionOfFileName("icon_AI_v2.svg", "icon_AI")).toBe(2);
    expect(versionOfFileName("other_AI_v2.svg", "icon_AI")).toBeNull();
  });

  it("picks the next version from disk AND the pair file's history", () => {
    const meta = withVersion(file(), rec(1));
    expect(nextVersion("x_AI", [], meta.versions)).toBe(2);
    expect(nextVersion("x_AI", ["x_AI.svg", "x_AI_v2.svg"], meta.versions)).toBe(3);
    expect(nextVersion("x_AI", ["x_AI.svg", "x_AI_v7.svg"], [])).toBe(8);
    expect(nextVersion("x_AI", [], [])).toBe(1);
    const grown = withVersion(meta, rec(2));
    expect(grown.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(withVersion(grown, rec(1)).versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("finds the newest valid and the approved version, and tallies reviews", () => {
    const s = withVersion(withVersion(file(), rec(1, { review: "approved" })), rec(2));
    expect(newestValid(s.versions)?.version).toBe(2);
    expect(approvedVersion(s.versions)?.version).toBe(1);
    expect(tallyReviews(s.versions)).toEqual({ pending: 1, approved: 1, declined: 0 });
    const failed = withVersion(s, rec(3, { status: "failed", validation: { ok: false, errors: ["x"], warnings: [], icons: 0 } }));
    expect(newestValid(failed.versions)?.version).toBe(2);
    expect(newestValid([])).toBeNull();
  });

  it("round-trips a pair file and drops corrupt version records without touching files", () => {
    const s = withVersion(file(), rec(1));
    const parsed = parsePairMeta(serializePairMeta(s));
    expect(parsed.ok && parsed.meta.versions).toHaveLength(1);
    expect(parsePairMeta("{ not json").ok).toBe(false);
    expect(parsePairMeta(JSON.stringify({ v: 99, pair: {}, ai: {}, versions: [] })).ok).toBe(false);
    const base = JSON.parse(serializePairMeta(s)) as Record<string, unknown>;
    expect(parsePairMeta(JSON.stringify({ ...base, versions: "no" })).ok).toBe(false);
    const halfBad = parsePairMeta(JSON.stringify({ ...base, versions: [rec(1), { version: "x" }] }));
    expect(halfBad.ok && halfBad.meta.versions).toHaveLength(1);
  });
});

describe("svgrequest", () => {
  // The payload itself (and which sampling fields a model accepts) is asserted
  // in tests/svg_send.test.ts against the real capability rules; here we only
  // read a response back.
  it("reads tokens and the provider-reported cost, inventing nothing", () => {
    expect(readUsage({ usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, cost: 0.0123 } }))
      .toEqual({ input: 7, output: 3, total: 10, cost: 0.0123, currency: "USD" });
    expect(readUsage({})).toEqual({ input: null, output: null, total: null, cost: null, currency: "USD" });
    expect(readContent({ choices: [{ message: { content: "svg here" } }] })).toBe("svg here");
    expect(readContent({ choices: [] })).toBeNull();
    expect(readContent({ choices: [{ message: { content: "  " } }] })).toBeNull();
  });

  it("classifies every failure mode, retrying only what is safe to repeat", () => {
    const auth = classifyHttp(401, { error: { message: "bad key" } }, null);
    expect(auth).toMatchObject({ kind: "auth", retryable: false });
    expect(auth.message).toContain("bad key");
    expect(classifyHttp(429, {}, 4000)).toMatchObject({ kind: "rate_limit", retryable: true, retryAfterMs: 4000 });
    expect(classifyHttp(404, { error: { message: "model not found" } }, null)).toMatchObject({ kind: "model", retryable: false });
    expect(classifyHttp(400, { error: { message: "bad payload" } }, null)).toMatchObject({ kind: "payload", retryable: false });
    expect(classifyHttp(504, {}, null)).toMatchObject({ kind: "provider_timeout", retryable: false });
    expect(classifyHttp(503, {}, null)).toMatchObject({ kind: "provider", retryable: true });
    expect(classifyHttp(418, {}, null)).toMatchObject({ kind: "malformed", retryable: false });
    expect(classifyTransport(new Error("offline"), { stalled: false, aborted: false })).toMatchObject({ kind: "network", retryable: true });
    expect(classifyTransport(new Error("t"), { stalled: true, aborted: false })).toMatchObject({ kind: "stalled", retryable: false });
    expect(classifyTransport(null, { stalled: false, aborted: true })).toMatchObject({ kind: "aborted", retryable: false });
  });

  it("reads Retry-After as seconds or as an HTTP date", () => {
    const headers = { get: (n: string) => (n === "retry-after" ? "3" : null) };
    expect(readRetryAfterMs(headers)).toBe(3000);
    const date = { get: (n: string) => (n === "retry-after" ? new Date(Date.now() + 2000).toUTCString() : null) };
    expect(readRetryAfterMs(date)).toBeGreaterThan(0);
    expect(readRetryAfterMs({ get: () => null })).toBeNull();
    expect(readRetryAfterMs(undefined)).toBeNull();
  });
});

describe("svgusage", () => {
  it("formats tokens and cost, showing — for anything not reported", () => {
    expect(fmtTokens(4810)).toBe("4,810");
    expect(fmtTokens(10_500)).toBe("10.5k");
    expect(fmtTokens(null)).toBe("—");
    expect(fmtCost(0.036)).toBe("$0.0360");
    expect(fmtCost(null)).toBe("—");
    expect(usageLine({ input: 1, output: 2, total: 3, cost: 0.01, currency: "USD" })).toBe("1 in · 2 out · 3 total · $0.0100 reported");
    expect(usageLine({ input: null, output: null, total: null, cost: null, currency: "USD" })).toContain("no cost reported");
  });

  it("sums a batch and labels an allocated split as Estimated", () => {
    const sum = sumUsage([
      { input: 10, output: 20, total: 30, cost: 0.01, currency: "USD" },
      { input: null, output: null, total: null, cost: null, currency: "USD" },
    ]);
    expect(sum).toMatchObject({ input: 10, output: 20, total: 30, cost: 0.01 });
    expect(sumUsage([{ input: null, output: null, total: null, cost: null, currency: "USD" }]))
      .toMatchObject({ input: null, cost: null });
    const per = allocateUsage({ input: 40, output: 80, total: 120, cost: 0.04, currency: "USD" }, 4);
    expect(per).toMatchObject({ input: 10, output: 20, total: 30, cost: null, estimated: 0.01 });
    expect(usageLine(per)).toContain("Estimated");
    expect(allocateUsage({ input: 1, output: 1, total: 1, cost: null, currency: "USD" }, 0).input).toBeNull();
  });
});
