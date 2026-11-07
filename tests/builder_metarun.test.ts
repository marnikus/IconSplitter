// @vitest-environment node
// builder_metarun.test.ts — P6: one confirmed metadata request, end to end.
//
// The failure policy is "SVG to upload"'s, deliberately unchanged (Q2): a timeout or
// a disconnect is OUTCOME-UNKNOWN and is never resent automatically — it is
// journalled so a restart reports `interrupted` instead of guessing. Only a
// provider-confirmed failure (429/5xx) is retried, and a truncated answer is
// reported as truncated, never parsed as valid.

import { describe, expect, it } from "vitest";
import { runSheetMeta } from "../src/builder/metarun";
import { buildSheetMetaRequest } from "../src/lib/builder/metarequest";
import { DEFAULT_METADATA_PROMPT } from "../src/lib/upload/meta";
import type { GeminiConfig } from "../src/lib/upload/gemini";

const CONFIG: GeminiConfig = { baseUrl: "https://g.test/v1beta", model: "m-1", timeoutMs: 1000, retries: 2, concurrency: 1 };
const GOOD = "Title: Kitchen tools drawn as simple line icons\nDescription: A calm set of kitchen tools drawn as editable line icons\nTags: icon, pictogram, vector, stroke, line, editable, web, kitchen, tool, calm, simple";
const ARGS = buildSheetMetaRequest({
  prompt: DEFAULT_METADATA_PROMPT, sheetSvg: `<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>`,
  icons: [{ id: "a", name: "Pot", viewBox: "0 0 24 24", paths: 1, tags: [] }],
  title: "", subtitle: "", config: { width: 100, height: 100, columns: 1, rows: 1 },
});

const reply = (text: string, finish: string | null = "STOP") => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text }] }, finishReason: finish }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
}), { status: 200, headers: { "content-type": "application/json" } });

describe("a confirmed request — the whole pipeline", () => {
  it("sends exactly the disclosed body, then parses and validates the answer", async () => {
    const seen: string[] = [];
    const out = await runSheetMeta({
      request: ARGS, prompt: DEFAULT_METADATA_PROMPT, fingerprint: "abcd1234",
      config: CONFIG, apiKey: "k",
      fetch: async (_u, init) => { seen.push(String(init.body)); return reply(GOOD); },
    });
    expect(out.outcome).toBe("generated");
    expect(JSON.parse(seen[0])).toEqual(ARGS.body);
    expect(out.record?.title).toContain("Kitchen tools");
    expect(out.record?.validation.ok).toBe(true);
    expect(out.record?.state).toBe("generated");
    expect(out.record?.usage.total).toBe(30);
  });

  it("a malformed answer is terminal and stores no metadata", async () => {
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: CONFIG, apiKey: "k",
      fetch: async () => reply("here you go: some prose"),
    });
    expect(out.outcome).toBe("invalid");
    expect(out.record).toBeNull();
  });

  it("an answer that fails validation is kept as invalid, with its reasons", async () => {
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: CONFIG, apiKey: "k",
      fetch: async () => reply("Title: Two words\nDescription: Short too\nTags: icon"),
    });
    expect(out.outcome).toBe("invalid");
    expect(out.record?.state).toBe("invalid");
    expect(out.record?.validation.errors.length).toBeGreaterThan(0);
  });

  it("a truncated answer is reported truncated, never parsed as valid", async () => {
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: CONFIG, apiKey: "k",
      fetch: async () => reply("Title: Kitchen tools drawn as simple", "MAX_TOKENS"),
    });
    expect(out.outcome).toBe("truncated");
    expect(out.record).toBeNull();
    expect(out.detail.toLowerCase()).toContain("truncated");
  });
});

describe("failure policy — same as upload", () => {
  it("a 429 is retried, and a later success wins", async () => {
    let calls = 0;
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: CONFIG, apiKey: "k",
      sleep: async () => undefined,
      fetch: async () => { calls += 1; return calls === 1 ? new Response("{}", { status: 429 }) : reply(GOOD); },
    });
    expect(calls).toBe(2);
    expect(out.outcome).toBe("generated");
  });

  it("a timeout is outcome-unknown: never resent, and it is journalled", async () => {
    let calls = 0;
    let journalled = false;
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: CONFIG, apiKey: "k",
      journal: {
        begin: () => { journalled = true; },
        clear: () => undefined,
      },
      fetch: async () => { calls += 1; throw new Error("network down"); },
    });
    expect(calls).toBe(1);
    expect(journalled).toBe(true);
    expect(out.outcome).toBe("failed");
    expect(out.outcomeUnknown).toBe(true);
  });

  it("a blocked request is terminal and is not retried", async () => {
    let calls = 0;
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: CONFIG, apiKey: "k",
      fetch: async () => { calls += 1; return new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }); },
    });
    expect(calls).toBe(1);
    expect(out.outcome).toBe("failed");
    expect(out.outcomeUnknown).toBe(false);
  });

  it("a key problem never echoes the key into the detail", async () => {
    const out = await runSheetMeta({
      request: ARGS, prompt: "p", fingerprint: "f", config: { ...CONFIG, retries: 0 }, apiKey: "SECRET-KEY-123",
      fetch: async () => new Response(JSON.stringify({ error: "bad key SECRET-KEY-123" }), { status: 400 }),
    });
    expect(out.outcome).toBe("failed");
    expect(out.detail).not.toContain("SECRET-KEY-123");
  });
});
