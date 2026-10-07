// RULE 8 — the metadata pipeline runs for real over a fake transport: the
// exact default prompt goes out with the preview image, the answer is parsed
// and validated deterministically, only provider-confirmed failures are
// retried (timeouts/disconnects never), cancels stop cleanly, the in-flight
// journal opens and closes (and survives a "restart" as interrupted), and no
// API key ever appears in a reported detail.
import { describe, expect, it } from "vitest";
import { generateMetadata } from "../src/upload/runmetadata";
import { createMemoryJournal, createStoredJournal, type StorageLike } from "../src/upload/journal";
import { DEFAULT_METADATA_PROMPT, MANDATORY_TAGS } from "../src/lib/upload/meta";
import type { GeminiConfig } from "../src/lib/upload/gemini";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/upload/gemini";

const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];

const ANSWER = `Title: Minimal line icon of growth. Speed and growth pictogram
Description: Clean line icon showing growth and rising business trends
Tags: ${TAGS.join(", ")}`;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#000"/></svg>`;
const API_KEY = "test-gemini-key-123";

function okBody(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
  };
}

function fakeFetch(handler: (body: { contents: unknown[] }) => Response): {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  seen: { url: string; body: { contents: unknown[] } }[];
} {
  const seen: { url: string; body: { contents: unknown[] } }[] = [];
  return {
    seen,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body as string) as { contents: unknown[] };
      seen.push({ url, body });
      return handler(body);
    },
  };
}

const jsonResponse = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), headers: { get: () => null } }) as unknown as Response;

const render = async () => "data:image/jpeg;base64,QUJD";

const args = (over: Record<string, unknown> = {}) => ({
  rowId: "pair_abc",
  svgText: SVG,
  apiKey: API_KEY,
  deps: { render, ...((over.deps as object) ?? {}) },
  ...over,
});

describe("generateMetadata — the happy path", () => {
  it("sends the exact default prompt with the preview and returns validated metadata", async () => {
    const { fetch, seen } = fakeFetch(() => jsonResponse(200, okBody(ANSWER)));
    const result = await generateMetadata(args({ deps: { render, fetch } }));
    expect(result.outcome).toBe("generated");
    expect(result.metadata?.tags).toHaveLength(40);
    expect(result.validation?.ok).toBe(true);
    expect(result.usage).toEqual({ input: 100, output: 200, total: 300 });
    expect(result.attempts).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toContain("/models/gemini-3.1-flash-lite:generateContent");
    const parts = (seen[0].body.contents as { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[])[0].parts;
    expect(parts[0].text).toBe(DEFAULT_METADATA_PROMPT);
    expect(parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "QUJD" });
  });

  it("journals the in-flight request and closes it when done", async () => {
    const journal = createMemoryJournal();
    let openDuring = 0;
    const { fetch } = fakeFetch(() => {
      openDuring = journal.pending().length;
      return jsonResponse(200, okBody(ANSWER));
    });
    const result = await generateMetadata(args({ deps: { render, fetch, journal } }));
    expect(result.outcome).toBe("generated");
    expect(openDuring).toBe(1); // open while the request was in flight
    expect(journal.pending()).toHaveLength(0); // closed when done
  });
});

describe("generateMetadata — deterministic parse + validation", () => {
  it("reports an unparseable answer as invalid, never guessed", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(200, okBody("I cannot help with that.")));
    const result = await generateMetadata(args({ deps: { render, fetch } }));
    expect(result.outcome).toBe("invalid");
    expect(result.metadata).toBeNull();
    expect(result.detail).toContain("three labeled lines");
  });

  it("reports a rule-breaking answer as invalid with the validation errors", async () => {
    const bad = ANSWER.replace(`Tags: ${TAGS.join(", ")}`, `Tags: ${TAGS.slice(1).join(", ")}`); // 39 tags
    const { fetch } = fakeFetch(() => jsonResponse(200, okBody(bad)));
    const result = await generateMetadata(args({ deps: { render, fetch } }));
    expect(result.outcome).toBe("invalid");
    expect(result.metadata?.tags).toHaveLength(39);
    expect(result.validation?.ok).toBe(false);
    expect(result.validation?.errors[0]).toContain("exactly 40");
  });
});

describe("generateMetadata — the retry policy (design §5, I-20)", () => {
  it("auto-retries a provider-confirmed 429, honouring Retry-After", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetch = async (): Promise<Response> => {
      calls++;
      if (calls === 1) {
        return {
          ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }),
          headers: { get: (n: string) => (n === "retry-after" ? "3" : null) },
        } as unknown as Response;
      }
      return jsonResponse(200, okBody(ANSWER));
    };
    const config: GeminiConfig = { ...DEFAULT_GEMINI_CONFIG, retries: 2 };
    const result = await generateMetadata(args({ config, deps: { render, fetch, sleep: async (ms: number) => { sleeps.push(ms); } } }));
    expect(result.outcome).toBe("generated");
    expect(result.attempts).toBe(2);
    expect(sleeps).toEqual([3000]);
  });

  it("never retries an auth failure", async () => {
    let calls = 0;
    const fetch = async (): Promise<Response> => {
      calls++;
      return jsonResponse(401, { error: { code: 401, message: "bad key", status: "UNAUTHENTICATED" } });
    };
    const result = await generateMetadata(args({ deps: { render, fetch } }));
    expect(result.outcome).toBe("failed");
    expect(result.failure?.kind).toBe("auth");
    expect(calls).toBe(1);
  });

  it("never auto-retries a disconnect (outcome unknown — no duplicate paid call)", async () => {
    let calls = 0;
    const fetch = async (): Promise<Response> => {
      calls++;
      throw new TypeError("fetch failed");
    };
    const result = await generateMetadata(args({ deps: { render, fetch } }));
    expect(result.outcome).toBe("failed");
    expect(result.failure?.kind).toBe("network");
    expect(result.failure?.retryable).toBe(false);
    expect(calls).toBe(1);
  });

  it("never auto-retries a client timeout", async () => {
    let calls = 0;
    const fetch = (_url: string, init: RequestInit): Promise<Response> => new Promise((_r, reject) => {
      calls++;
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
    const config: GeminiConfig = { ...DEFAULT_GEMINI_CONFIG, timeoutMs: 5, retries: 5 };
    const result = await generateMetadata(args({ config, deps: { render, fetch } }));
    expect(result.outcome).toBe("failed");
    expect(result.failure?.kind).toBe("timeout");
    expect(calls).toBe(1);
  });

  it("cancels before sending when the signal is already aborted", async () => {
    let calls = 0;
    const fetch = async (): Promise<Response> => {
      calls++;
      return jsonResponse(200, okBody(ANSWER));
    };
    const controller = new AbortController();
    controller.abort();
    const result = await generateMetadata(args({ signal: controller.signal, deps: { render, fetch } }));
    expect(result.outcome).toBe("cancelled");
    expect(calls).toBe(0);
  });

  it("fails honestly when the preview render throws", async () => {
    const deps = { render: async () => { throw new Error("no canvas"); } };
    const result = await generateMetadata(args({ deps }));
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("no canvas");
  });

  it("fails honestly with no API key, without sending anything", async () => {
    let calls = 0;
    const fetch = async (): Promise<Response> => {
      calls++;
      return jsonResponse(200, okBody(ANSWER));
    };
    const result = await generateMetadata(args({ apiKey: "  ", deps: { render, fetch } }));
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("no Gemini API key");
    expect(calls).toBe(0);
  });

  it("redacts the API key out of a reported failure detail", async () => {
    const fetch = async (): Promise<Response> =>
      jsonResponse(400, { error: { code: 400, message: `invalid key ${API_KEY} given`, status: "INVALID_ARGUMENT" } });
    const result = await generateMetadata(args({ deps: { render, fetch } }));
    expect(result.outcome).toBe("failed");
    expect(result.detail).not.toContain(API_KEY);
    expect(result.detail).toContain("invalid key");
  });
});

describe("the stored journal — a restart reports interrupted, never resends", () => {
  function fakeStorage(): StorageLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => { map.set(k, v); },
      removeItem: (k) => { map.delete(k); },
    };
  }

  it("persists in-flight entries across a restart", () => {
    const storage = fakeStorage();
    const first = createStoredJournal(storage);
    first.begin({ rowId: "pair_abc", startedAt: 1, requestId: null });
    expect(first.pending()).toHaveLength(1);
    const afterRestart = createStoredJournal(storage); // a new session, same storage
    expect(afterRestart.pending()).toHaveLength(1); // still open → interrupted
    expect(afterRestart.pending()[0].rowId).toBe("pair_abc");
    afterRestart.end("pair_abc");
    expect(afterRestart.pending()).toHaveLength(0);
    expect(createStoredJournal(storage).pending()).toHaveLength(0);
  });

  it("tolerates a corrupt journal payload", () => {
    const storage = fakeStorage();
    storage.setItem("iconSplitter.upload.journal.v1", "not json");
    expect(createStoredJournal(storage).pending()).toEqual([]);
  });
});
