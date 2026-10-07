// svgup_provider.test.ts — provider and model rules (design §8). The two claims
// the request makes explicit are the two that are proven here: the configured
// model is verified against the provider's own list and NOTHING is substituted
// when it is absent (including when the list cannot be read at all), and a cost
// figure is either the provider's number or clearly labelled an estimate.
import { describe, expect, it } from "vitest";
import { FLASH_LITE, RATE_CARD, chooseModel, costLine, estimateCost, splitId, tokensText } from "../src/lib/svgupload/provider";

const catalog = (ids: string[]) => ids.map((id) => ({ id }));

describe("chooseModel", () => {
  it("accepts the exact id when the provider lists it", () => {
    expect(chooseModel(catalog(["google/gemini-2.5-flash", FLASH_LITE]), FLASH_LITE)).toEqual({ ok: true, model: FLASH_LITE, source: "verified" });
  });

  it("refuses an id the provider does not offer, and never substitutes one", () => {
    const out = chooseModel(catalog(["gemini-3.1-flash-lite-preview", "google/gemini-3-pro-image-preview"]), FLASH_LITE);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toContain(`does not offer "${FLASH_LITE}"`);
      expect(out.reason).toContain("Nothing was substituted");
      expect(out.reason).toContain("gemini-3.1-flash-lite-preview"); // a useful hint, clearly labelled "similar"
    }
  });

  it("refuses a PREFIX match — a longer id is a different model", () => {
    expect(chooseModel(catalog([`vertex/${FLASH_LITE}-preview`]), FLASH_LITE).ok).toBe(false);
    expect(chooseModel(catalog([`vertex/${FLASH_LITE}`]), `vertex/${FLASH_LITE}`).ok).toBe(true);
  });

  it("refuses to run unverified when the model list could not be read", () => {
    const out = chooseModel(null, FLASH_LITE);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toContain("could not be read");
      expect(out.reason).toContain("saved anyway"); // the provider choice is kept regardless
    }
    expect(chooseModel([], FLASH_LITE).ok).toBe(false);
  });

  it("refuses an empty configured model with its own wording", () => {
    const out = chooseModel(catalog([FLASH_LITE]), "   ");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("No model is configured");
  });
});

describe("splitId", () => {
  it("splits on the last slash so prefixed ids keep their namespace", () => {
    expect(splitId("vertex/google/gemini-x")).toEqual({ head: "vertex/google", tail: "gemini-x" });
    expect(splitId("gemini-x")).toEqual({ head: "", tail: "gemini-x" });
  });
});

describe("cost", () => {
  it("estimates from the rate card and rounds to five decimals", () => {
    expect(estimateCost({ input: 1_000_000, output: 1_000_000 })).toBeCloseTo(RATE_CARD.input + RATE_CARD.output, 5);
    expect(estimateCost({ input: 1200, output: 900 })).toBeCloseTo(0.00165, 5);
    expect(estimateCost({ input: null, output: null })).toBeNull();
    expect(estimateCost({ input: 500, output: null })).toBeCloseTo(0.00013, 5);
  });

  it("prefers the provider's own number and says so", () => {
    const line = costLine(0.0021, { input: 1200, output: 900 });
    expect(line.estimated).toBe(false);
    expect(line.text).toBe("$0.00210 (provider)");
  });

  it("labels the rate-card figure as an estimate, never mixing the two", () => {
    const line = costLine(null, { input: 1200, output: 900 });
    expect(line.estimated).toBe(true);
    expect(line.text).toContain("Estimated");
    expect(line.text).toContain("rate card");
  });

  it("says the cost is unknown when no tokens were reported", () => {
    const line = costLine(null, { input: null, output: null });
    expect(line.text).toContain("cost unknown");
  });
});

describe("tokensText", () => {
  it("formats the two counts, and says so when the provider reported none", () => {
    expect(tokensText({ input: 1204, output: 512, total: 1716 })).toBe("1,204 in / 512 out");
    expect(tokensText({ input: null, output: null, total: null })).toBe("tokens not reported");
  });
});
