// A metadata answer that PASSES the policy: two sentences of 5-7 + 3-5 words, a
// 7-15 word description, exactly 40 tags including the seven required terms. The
// export, store and UI tests share it, and `acceptedMeta` exists so a policy
// change breaks one helper instead of a dozen fixtures.
import { REQUIRED_TAGS, TAG_COUNT, type MetaRecord } from "../../src/lib/svgupload/metaprompt";

/** 40 lowercase, unique tags — the seven required ones first. */
export function fortyTags(): string[] {
  const extra = [
    "trophy", "award", "win", "prize", "champion", "victory", "medal", "success",
    "achievement", "honor", "cup", "gold", "contest", "competition", "ranking",
    "first", "place", "goal", "score", "talent", "skill", "business", "commerce",
    "retail", "store", "shop", "market", "product", "badge", "emblem", "symbol",
    "graphic", "design", "simple", "modern", "minimal", "outline", "shape", "object",
  ];
  return [...REQUIRED_TAGS, ...extra].slice(0, TAG_COUNT);
}

/** The content identity a fixture source stands for (sha256 of "abc"). */
export const SOURCE_SHA = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

/** An accepted record for pair `p1`, SOURCE_SHA's identity unless overridden. */
export function acceptedMeta(over: Partial<MetaRecord> = {}): MetaRecord {
  return {
    pairId: "p1",
    title: "Trophy award symbol for winners. Icon of trophy and award.",
    description: "A simple trophy drawn with clean editable strokes for winner and success listings.",
    tags: fortyTags(),
    at: "2026-10-07T09:00:00Z",
    prompt: "the exact prompt",
    provider: "requesty",
    model: "gemini-3.1-flash-lite",
    requestId: "req_9",
    usage: { input: 900, output: 300, total: 1200 },
    cost: { actual: 0.0007, estimated: null, currency: "USD" },
    status: "accepted",
    errors: [],
    warnings: [],
    sourceFingerprint: SOURCE_SHA,
    ...over,
  };
}
