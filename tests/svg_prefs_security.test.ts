import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPT, DEFAULT_SVG_PREFERENCES, containsCredential, parseSvgPreferences } from "../src/svg/prefs";
import { redactSecrets, safeErrorText } from "../src/svg/security";

const exactDefault = "Create 4 split SVG icons. Snap visually intended connections exactly to curves/anchors. Never leave tiny gaps, floating endpoints, overshoots, or approximate joins. Preserve seamless geometry without breaking the intended image.";

describe("SVG preferences and credential boundaries", () => {
  it("keeps the exact required prompt and validates every persisted control", () => {
    expect(DEFAULT_PROMPT).toBe(exactDefault);
    expect(DEFAULT_SVG_PREFERENCES.prompt).toBe(exactDefault);
    const parsed = parseSvgPreferences({ ...DEFAULT_SVG_PREFERENCES, timeoutMs: 999_999, imagesPerRequest: 99,
      concurrency: 0, thumbHeight: 1000, sortBy: "unknown", search: "folder" });
    expect(parsed).toMatchObject({ timeoutMs: 300_000, imagesPerRequest: 9, concurrency: 1, thumbHeight: 180, sortBy: "date", search: "folder" });
  });

  it("accepts only the Requesty HTTPS v1 router, never a host that could receive the key", () => {
    expect(parseSvgPreferences({ baseUrl: "https://router.requesty.ai/v1/" }).baseUrl).toBe("https://router.requesty.ai/v1");
    for (const baseUrl of ["http://router.requesty.ai/v1", "https://evil.example/v1",
      "https://router.requesty.ai.evil.example/v1", "https://user@router.requesty.ai/v1",
      "https://router.requesty.ai/v2", "https://router.requesty.ai/v1?key=x", "https://router.requesty.ai:444/v1"]) {
      expect(parseSvgPreferences({ baseUrl }).baseUrl).toBe(DEFAULT_SVG_PREFERENCES.baseUrl);
    }
  });

  it("blocks Requesty/OpenAI key-like strings from persisted user-editable text", () => {
    expect(containsCredential("rq_live_abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(containsCredential("sk-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
    expect(containsCredential("ordinary prompt text")).toBe(false);
    expect(parseSvgPreferences({ prompt: "rq_live_abcdefghijklmnopqrstuvwxyz" }).prompt).toBe(exactDefault);
    expect(parseSvgPreferences({ model: "sk-abcdefghijklmnopqrstuvwxyz123456" }).model).toBe(DEFAULT_SVG_PREFERENCES.model);
  });

  it("redacts secrets and image payloads before an error can reach UI or sidecars", () => {
    const key = "rq_live_abcdefghijklmnopqrstuvwxyz";
    expect(redactSecrets(`failed ${key} data:image/png;base64,YWJj`)).toBe("failed [redacted] [image data removed]");
    expect(safeErrorText(`  provider rejected ${key}  `)).toBe("provider rejected [redacted]");
    expect(safeErrorText(" ")).toBeNull();
  });
});
