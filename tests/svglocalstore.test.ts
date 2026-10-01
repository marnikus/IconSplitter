// svglocalstore.test.ts — config, prompt and key stores over localStorage:
// defaults on first run, tolerant parse, masked key, no key in exports.
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "../src/svggen/configstore";
import { DEFAULT_PROMPT, loadPrompt, resetPrompt, savePrompt } from "../src/svggen/promptstore";
import { clearKey, getKey, maskedKey, setKey } from "../src/svggen/keystore";

beforeEach(() => localStorage.clear());

describe("configstore", () => {
  it("returns documented defaults when nothing is stored", () => {
    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe("https://router.requesty.ai/v1");
    expect(cfg.model).toBe("openai/gpt-6.1-sol");
    expect(cfg.perRequest).toBe(4);
  });

  it("round-trips and clamps hostile values", () => {
    saveConfig({ ...loadConfig(), perRequest: 99, timeoutMs: -5, model: "openai/gpt-6.1-sol" });
    const cfg = loadConfig();
    expect(cfg.perRequest).toBe(9);
    expect(cfg.timeoutMs).toBeGreaterThan(0);
  });

  it("ignores a corrupt stored config", () => {
    localStorage.setItem("iconSplitter.svggen.config.v1", "{broken");
    expect(loadConfig().model).toBe("openai/gpt-6.1-sol");
  });
});

describe("promptstore", () => {
  it("loads the default, saves edits, resets", () => {
    expect(loadPrompt()).toBe(DEFAULT_PROMPT);
    savePrompt("custom rules");
    expect(loadPrompt()).toBe("custom rules");
    resetPrompt();
    expect(loadPrompt()).toBe(DEFAULT_PROMPT);
  });

  it("default mentions seamless geometry", () => {
    expect(DEFAULT_PROMPT).toMatch(/seamless geometry/i);
  });
});

describe("keystore", () => {
  it("stores the raw key for the client but only exposes a mask", () => {
    expect(getKey()).toBeNull();
    setKey("rq_live_abcdef1234A2F");
    expect(getKey()).toBe("rq_live_abcdef1234A2F");
    expect(maskedKey()).toContain("••••");
    expect(maskedKey()).not.toContain("abcdef1234");
  });

  it("clear removes it entirely", () => {
    setKey("rq_live_abcdef1234A2F");
    clearKey();
    expect(getKey()).toBeNull();
    expect(maskedKey()).toBe("");
  });
});
