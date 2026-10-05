import { afterEach, describe, expect, it, vi } from "vitest";
import { logSvgDiagnostic, safeSvgErrorText, type SvgRequestDiagnostic } from "../src/lib/svgdiagnostics";

afterEach(() => vi.restoreAllMocks());

describe("safe SVG request diagnostics", () => {
  it("logs timing and request metadata without prompt, image, SVG, key or source details", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const unsafe = {
      kind: "request",
      traceId: "local-batch_1-abc",
      batchId: "batch_1_2",
      attempt: 1,
      model: "anthropic/claude-opus-5",
      effort: "medium",
      images: 2,
      maxTokens: 64_000,
      timeoutMs: 180_000,
      apiStartedAt: "2026-10-05T12:00:00.000Z",
      firstEventMs: 120,
      firstTokenMs: 850,
      completionMs: 15_400,
      responseEndedMs: 15_400,
      parseMs: 3,
      totalMs: 15_410,
      transport: "sse",
      status: 200,
      retryAfterMs: null,
      requestId: "req_safe_1",
      finishReason: "stop",
      outcome: "complete",
      failure: null,
      error: null,
      timing: {
        apiStartedAt: "2026-10-05T12:00:00.000Z",
        firstEventMs: 120,
        firstTokenMs: 850,
        completionMs: 15_400,
        responseEndedMs: 15_400,
        parseMs: 3,
        totalMs: 15_410,
        transport: "sse",
      },
      prompt: "do not log prompt",
      apiKey: "secret-test-value",
      image: "data:image/png;base64,private-pixels",
      svg: "<svg>private-art</svg>",
      sourcePath: "/private/folder/icon.png",
    } as unknown as SvgRequestDiagnostic;
    logSvgDiagnostic(unsafe);
    const record = String(output.mock.calls[0][1]);
    expect(output.mock.calls[0][0]).toBe("[IconSplitter SVG]");
    expect(record).toContain("firstTokenMs");
    expect(record).toContain("req_safe_1");
    for (const privateValue of ["do not log prompt", "secret-test-value", "private-pixels", "private-art", "/private/folder"]) {
      expect(record).not.toContain(privateValue);
    }
  });

  it("redacts private error context without corrupting short generic prompts", () => {
    const prompt = "A private request sentence that may be echoed";
    const key = "a-user-key";
    const source = "/private/folder/icon.png";
    const error = `provider echoed ${prompt} from ${source}; key ${key}; data:image/png;base64,private-pixels <svg>private-art</svg>`;
    const safe = safeSvgErrorText(error, key, prompt, [source, "icon.png"]);
    for (const privateValue of [prompt, source, "icon.png", key, "private-pixels", "private-art"]) {
      expect(safe).not.toContain(privateValue);
    }
    expect(safe).toContain("[prompt omitted]");
    expect(safe).toContain("[source]");
    expect(safe).toContain("[image omitted]");
    expect(safe).toContain("[SVG omitted]");
    expect(safeSvgErrorText("the answer was cut off at the token ceiling", "p", "p", ["p"]))
      .toBe("the answer was cut off at the token ceiling");
  });
});
