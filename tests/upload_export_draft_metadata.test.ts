// Metadata that is not accepted yet is still saved (2026-11-13): an answer with
// a title, a description and keywords but no Icon Name is "invalid", and the
// export used to write `"metadata": null` — the text was lost. It is now kept in
// export.json with its state and validation errors, never embedded into the
// files (only accepted text is), comes back into the row on reload, and does not
// make the row look stale or force a rebuild.
import { describe, expect, it } from "vitest";
import { embeddedMetadataFp, metadataBlock, type ExportRecord } from "../src/lib/upload/export";
import { metadataFingerprint, validateUploadMetadata, type IconMetadata } from "../src/lib/upload/meta";
import { planStages } from "../src/lib/upload/exportplan";
import { draftFromRecord, savedMetadataMoved as metadataMovedForTest } from "../src/upload/recorddraft";
import { runExport } from "../src/upload/runexport";
import { readBytesAt } from "../src/lib/fs";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { stockExportArgs, STOCK_TEST_SVGS } from "./helpers/stockexport";

const NO_NAME: IconMetadata = {
  title: "Apple in a box icon for grocery delivery",
  description: "Line icon of a fresh apple packed in a cardboard box for food delivery",
  tags: ["apple", "box", "delivery", "grocery", "fruit", "package", "food", "fresh", "icon", "line"],
};
const INFO = { prompt: "p", provider: "gemini", model: "m", requestId: null, usage: { input: null, output: null, total: null } };
const invalidBlock = () => metadataBlock(NO_NAME, {
  ...INFO, fingerprint: metadataFingerprint(NO_NAME), validation: validateUploadMetadata(NO_NAME),
});

describe("the record block of metadata that is not accepted", () => {
  it("is saved as invalid with the reason, and its fingerprint never counts as embedded", () => {
    const block = invalidBlock()!;
    expect(block).toMatchObject({ state: "invalid", title: NO_NAME.title, tags: NO_NAME.tags });
    expect(block.validation.errors.join(" ")).toMatch(/Icon Name is empty/);
    expect(embeddedMetadataFp({ metadata: block } as ExportRecord)).toBe("");
    const accepted = { ...block, state: "accepted" as const };
    expect(embeddedMetadataFp({ metadata: accepted } as ExportRecord)).toBe(block.fingerprint);
  });

  it("comes back into the row as an invalid draft that names the missing field", () => {
    const meta = draftFromRecord({ metadata: invalidBlock() } as ExportRecord);
    expect(meta.state).toBe("invalid");
    expect(meta.metadata).toMatchObject({ title: NO_NAME.title, description: NO_NAME.description });
    expect(meta.validation?.errors.join(" ")).toMatch(/Icon Name is empty/);
    expect(draftFromRecord(null).state).toBe("empty");
    expect(draftFromRecord({ metadata: null } as ExportRecord).state).toBe("empty");
  });

  it("does not make the planner rebuild the files for a draft it never embeds", () => {
    const record = { metadata: invalidBlock() } as unknown as ExportRecord;
    const input = {
      sourceHash: "h", settingsFp: "s", metadataFp: "", hasMetadata: false, optimize: false,
      includeEps: false, epsConverter: "builtin" as const,
      outputs: { svg: true, jpg: true, eps: true }, metadataOutputs: { svg: true, jpg: true, eps: true },
    };
    const full = { ...record, source: { fingerprint: "h" }, settings: { fingerprint: "s" }, outputs: { svg: {}, jpg: {}, eps: null }, tools: { eps: { enabled: false, converter: "builtin" }, svgo: { enabled: false } } } as unknown as ExportRecord;
    expect(planStages(full, input).stages).not.toContain("embed");
  });
});

describe("an export of a row whose metadata is not accepted", () => {
  it("writes the text into export.json and keeps it out of the files", async () => {
    const { args, root } = stockExportArgs(STOCK_TEST_SVGS[0]);
    const result = await runExport({
      ...args, metadata: null, metadataInfo: null,
      savedMetadata: { metadata: NO_NAME, state: "invalid", info: { ...INFO, validation: validateUploadMetadata(NO_NAME) } },
    });
    expect(result.status).toBe("processed");
    expect(result.record?.metadata).toMatchObject({ state: "invalid", title: NO_NAME.title, description: NO_NAME.description });
    const text = async (path: string) => new TextDecoder().decode(await readBytesAt(root, path) as Uint8Array);
    expect(JSON.parse(await text("export/export.json")).metadata?.title).toBe(NO_NAME.title);
    expect(readEmbeddedMetadata(await text("export/temporary.svg"))?.title ?? "").not.toBe(NO_NAME.title);
  });
});

// 2026-11-13, second report: the row was ALREADY exported (export.json had
// "metadata": null) and its answer came back without an Icon Name. Re-exporting
// changed nothing — with no file to rebuild the export returned the old record
// and never rewrote export.json — and the row showed "Processed", not stale.
describe("a row that was already exported, then got a partial answer", () => {
  it("re-export rewrites export.json with the draft and leaves the files alone", async () => {
    const { args, root } = stockExportArgs(STOCK_TEST_SVGS[0]);
    const first = await runExport({ ...args, metadata: null, metadataInfo: null });
    expect(first.status).toBe("processed");
    expect(first.record?.metadata).toBeNull();
    const bytes = async (p: string) => Buffer.from(await readBytesAt(root, p) as Uint8Array).toString("base64");
    const svgBefore = await bytes("export/temporary.svg");
    const again = await runExport({
      ...args, metadata: null, metadataInfo: null, record: first.record,
      savedMetadata: { metadata: NO_NAME, state: "invalid", info: { ...INFO, validation: validateUploadMetadata(NO_NAME) } },
    });
    expect(again.status, again.error?.detail).toBe("processed");
    expect(again.record?.metadata).toMatchObject({ state: "invalid", title: NO_NAME.title });
    const text = new TextDecoder().decode(await readBytesAt(root, "export/export.json") as Uint8Array);
    expect(JSON.parse(text).metadata?.description).toBe(NO_NAME.description);
    expect(await bytes("export/temporary.svg")).toBe(svgBefore); // nothing embedded, nothing rebuilt
  });

  it("an unchanged draft is not written again", () => {
    const record = { metadata: invalidBlock(), source: { fingerprint: "h" }, settings: { fingerprint: "s" }, outputs: { svg: {}, jpg: {}, eps: null }, tools: { eps: { enabled: false, converter: "builtin" }, svgo: { enabled: false } } } as unknown as ExportRecord;
    const input = {
      sourceHash: "h", settingsFp: "s", metadataFp: "", hasMetadata: false, optimize: false,
      includeEps: false, epsConverter: "builtin" as const,
      outputs: { svg: true, jpg: true, eps: true }, metadataOutputs: { svg: true, jpg: true, eps: true },
    };
    expect(planStages(record, { ...input, recordMetadataFp: metadataFingerprint(NO_NAME) }).stages).toEqual([]);
    expect(planStages(record, { ...input, recordMetadataFp: "other" }).stages).toEqual(["validate", "commit"]);
    expect(planStages(record, { ...input, recordMetadataFp: "other" }).rebuild).toEqual({ svg: false, jpg: false, eps: false });
  });

  it("the row says stale while export.json does not hold its current draft", () => {
    const draft = draftFromRecord({ metadata: invalidBlock() } as ExportRecord);
    const base = { source: { svgPath: "a.svg", version: 1 }, settings: { fingerprint: "x" } };
    const nullRecord = { ...base, metadata: null } as unknown as ExportRecord;
    const savedRecord = { ...base, metadata: invalidBlock() } as unknown as ExportRecord;
    expect(metadataMovedForTest(nullRecord, draft)).toBe(true);
    expect(metadataMovedForTest(savedRecord, draft)).toBe(false);
  });
});
