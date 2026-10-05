// svg_wire.test.ts — what is posted is what was confirmed (confirm-preview.md
// C-3) and a batch that cannot be proven the same is never posted (C-4). Driven
// through the REAL runner against a scripted fetch (RULE 8): the posted body is
// compared with the object the dialog renders, not with a second builder.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blobToDataUrl } from "../src/lib/dom";
import { fingerprintOf, withImage } from "../src/lib/svgpayload";
import { wireHeaders } from "../src/lib/svgrequest";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { KEY, block, failReply, okReply, runArgs, stemOf, stubCanvas, stubFetchSeq } from "./helpers/svgrun";

vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return {
    ...actual,
    loadImageFile: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
  };
});

const DATA_URL = "data:image/png;base64,AAAA";
const FIVE = ["alder", "birch", "cedar", "dune", "elm"];

beforeEach(() => stubCanvas());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function run(over: Parameters<typeof runArgs>[0] = {}) {
  const events: RunEvent[] = [];
  const args = runArgs({ ...over, onEvent: (e) => events.push(e) });
  const summary = await runGeneration(args);
  return { args, events, summary };
}

const failed = (events: RunEvent[]) =>
  events.filter((e): e is Extract<RunEvent, { kind: "request-failed" }> => e.kind === "request-failed");

describe("wire = preview", () => {
  it("posts exactly JSON.stringify of the confirmed request with the contact sheet filled in", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    const { args } = await run({ rules: "  Be crisp.  " });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toBe(JSON.stringify(withImage(args.prepared.batches[0].request, DATA_URL)));
    expect(JSON.parse(calls[0].body).messages[0].content[0].text).toBe(args.prepared.batches[0].parts.text);
  });

  it("posts each request of a run from its own prepared batch, in order", async () => {
    const calls = stubFetchSeq([okReply(FIVE.slice(0, 4).map((n) => block(stemOf(n))).join("\n")), okReply(block(stemOf("elm")))]);
    const { args } = await run({ names: FIVE, config: { imagesPerRequest: 4 } });
    expect(calls.map((c) => c.body)).toEqual(args.prepared.batches.map((b) => JSON.stringify(withImage(b.request, DATA_URL))));
  });

  it("posts the prepared object itself — a run never rebuilds the text it was handed", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    const args = runArgs({ rules: "original rules" });
    const batch = args.prepared.batches[0];
    const [text] = batch.request.messages[0].content;
    if (text.type === "text") text.text = "a different text, with its fingerprint re-measured";
    batch.fingerprint = fingerprintOf(batch.request);
    await runGeneration(args);
    expect(JSON.parse(calls[0].body).messages[0].content[0].text).toBe("a different text, with its fingerprint re-measured");
  });

  it("posts the identical string on every attempt of one request", async () => {
    const calls = stubFetchSeq([failReply(429, "slow", { "retry-after": "0" }), failReply(429, "slow", { "retry-after": "0" }), okReply(block("fog_AI"))]);
    await run({ config: { retries: 2 } });
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.body)).size).toBe(1);
  });

  it("posts the headers wireHeaders names — the same list the dialog shows", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    await run();
    expect(calls[0].init.headers).toEqual(wireHeaders(KEY));
  });

  it("posts to the endpoint the run was prepared for", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    const { args } = await run();
    expect(calls[0].url).toBe(args.prepared.endpoint);
  });
});

describe("fail closed", () => {
  it("refuses a batch whose image changed since the scan, posts nothing for it and still runs the next", async () => {
    const calls = stubFetchSeq([okReply(block(stemOf("elm")))]);
    const args = runArgs({ names: FIVE, config: { imagesPerRequest: 4 } });
    const arch = (args.root as FakeDir).children.get("architecture") as FakeDir;
    arch.children.set(`${stemOf("alder")}.png`, new FakeFile(`${stemOf("alder")}.png`, 20, 9999, "img-alder"));
    const events: RunEvent[] = [];
    const summary = await runGeneration({ ...args, onEvent: (e) => events.push(e) });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body).messages[0].content[0].text).toContain(stemOf("elm"));
    expect(failed(events)).toHaveLength(1);
    expect(failed(events)[0]).toMatchObject({ batchId: "batch_1_4", failure: "payload", count: 4 });
    expect(failed(events)[0].error).toContain("changed since it was scanned — rescan, then review again");
    expect(summary).toMatchObject({ saved: 1, failed: 4 });
  });

  it("never posts a request whose image slot cannot be filled", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    const args = runArgs();
    const batch = args.prepared.batches[0];
    const [text] = batch.request.messages[0].content;
    batch.request = { ...batch.request, messages: [{ role: "user", content: [text] }] };
    batch.fingerprint = fingerprintOf(batch.request);
    const events: RunEvent[] = [];
    await runGeneration({ ...args, onEvent: (e) => events.push(e) });
    expect(calls).toHaveLength(0);
    expect(failed(events)[0]).toMatchObject({ failure: "payload" });
    expect(failed(events)[0].error).toContain("exactly one image slot");
  });

  it("never posts a request whose image is not a data:image URL", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    vi.mocked(blobToDataUrl).mockResolvedValueOnce("blob:https://example.test/not-embedded");
    const { events } = await run();
    expect(calls).toHaveLength(0);
    expect(failed(events)[0]).toMatchObject({ failure: "payload" });
    expect(failed(events)[0].error).toContain("data:image/");
  });

  it("refuses a request that no longer matches the fingerprint the user saw", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    const args = runArgs();
    const [text] = args.prepared.batches[0].request.messages[0].content;
    if (text.type === "text") text.text += " (edited behind the dialog's back)";
    const events: RunEvent[] = [];
    await runGeneration({ ...args, onEvent: (e) => events.push(e) });
    expect(calls).toHaveLength(0);
    expect(failed(events)[0]).toMatchObject({ failure: "payload" });
    expect(failed(events)[0].error).toContain("changed after confirmation");
  });

  it("fails a batch whose source left the selection and says so, posting nothing", async () => {
    const calls = stubFetchSeq([okReply(block("fog_AI"))]);
    const args = runArgs({ names: ["alder", "birch"], config: { imagesPerRequest: 2 } });
    const events: RunEvent[] = [];
    const summary = await runGeneration({ ...args, sources: args.sources.slice(0, 1), onEvent: (e) => events.push(e) });
    expect(calls).toHaveLength(0);
    expect(failed(events)[0]).toMatchObject({ failure: "payload" });
    expect(failed(events)[0].error).toContain("selection changed after confirmation — nothing was sent");
    expect(summary.saved).toBe(0);
  });

  it("keeps the key out of every event even when the provider echoes it", async () => {
    stubFetchSeq([failReply(500, `upstream says ${KEY}`)]);
    const { events, summary } = await run();
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(summary.problems.join(" ")).not.toContain(KEY);
  });
});
