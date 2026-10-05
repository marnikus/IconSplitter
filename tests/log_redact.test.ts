// log_redact.test.ts — three layers keep a secret out of the log (log-contract.md
// §5): structure (a secret has no field to live in), value scrub (what looks like
// a secret is masked wherever it sits) and caps. Pure, so every case is a call
// (RULE 5/8). Secret-shaped strings are assembled from parts (helpers/logfix).
import { describe, expect, it } from "vitest";
import { LOG_DATA_KEYS } from "../src/lib/logentry";
import { sanitizeInput, scrubText } from "../src/lib/logredact";
import { BEARER, JWT, PLAIN_SECRET, RQ_KEY, SK_KEY, input } from "./helpers/logfix";

const clean = (message: string, secrets: string[] = []) => sanitizeInput(input({ message }), secrets).message;

describe("value scrub", () => {
  it("masks Requesty- and sk-shaped keys wherever they sit", () => {
    const out = sanitizeInput(input({ message: `a ${RQ_KEY} b`, data: { reason: `bad ${SK_KEY}` }, ids: { run: RQ_KEY } }), []);
    expect(JSON.stringify(out)).not.toContain(RQ_KEY);
    expect(JSON.stringify(out)).not.toContain(SK_KEY);
  });

  it("masks a registered key of no known shape, and ignores one too short to be a secret", () => {
    expect(clean(`oops ${PLAIN_SECRET} oops`, [PLAIN_SECRET])).not.toContain(PLAIN_SECRET);
    expect(clean("keep abc here", ["abc"])).toBe("keep abc here");
    expect(clean("keep it", ["", "   "])).toBe("keep it");
  });

  it("masks the longer of two overlapping registered secrets first", () => {
    const out = clean(`x ${PLAIN_SECRET}-tail y`, [PLAIN_SECRET, `${PLAIN_SECRET}-tail`]);
    expect(out).not.toContain("tail");
  });

  it("masks Bearer values, alone and inside an Authorization header", () => {
    expect(clean(`got ${BEARER} ok`)).not.toContain("abcDEF123456xyz");
    expect(clean(`Authorization: ${BEARER}`)).not.toContain("abcDEF123456xyz");
  });

  it.each(["api_key", "token", "client_secret", "password", "auth", "Set-Cookie", "session_id", "access-token", "X-Api-Key"])(
    "masks the value of %s, written with = or :", (name) => {
      expect(clean(`${name}=hunter2value&x=1`)).not.toContain("hunter2value");
      expect(clean(`${name}: hunter2value`)).not.toContain("hunter2value");
      expect(clean(`${name}="quoted secret value"`)).not.toContain("quoted secret");
    },
  );

  it("masks URL credentials and sensitive query values but keeps the rest of the URL", () => {
    const out = clean("GET https://user:pass1234@host.example/path?page=2&api_key=abc123&sig=zzz9 done");
    expect(out).not.toContain("pass1234");
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("zzz9");
    expect(out).toContain("host.example/path?page=2");
  });

  it("replaces data URLs and long base64 runs with a size-only placeholder", () => {
    const data = `data:image/png;base64,${"QUJD".repeat(60)}`;
    expect(clean(`image ${data} end`)).toBe(`image ‹blob ${data.length} chars› end`);
    const run = "QmFzZTY0".repeat(20);
    expect(clean(`blob ${run}`)).toBe(`blob ‹blob ${run.length} chars›`);
  });

  it("masks a JWT and a long hex run", () => {
    expect(clean(`jwt ${JWT} end`)).not.toContain("eyJ");
    expect(clean(`hex ${"ab12".repeat(10)} end`)).not.toContain("ab12ab12");
  });

  it("leaves everything that merely looks technical alone (false-positive guard)", () => {
    const keep = [
      "fog_architecture_041_AI.png", "v2", "3fa9c1d2.1b4", "0ce4918c", "batch_2_1", "r1xk-1",
      "4.1k in · 2.2k out · $0.0210 reported", "tokens: 120", "Keyboard: shortcuts", "author: Bob",
      "architecture/court_AI.png changed since it was scanned", "https://router.requesty.ai/v1/chat/completions",
    ];
    for (const text of keep) expect(clean(text), text).toBe(text);
  });
});

describe("structure", () => {
  it("drops data keys outside the allow-list and values that are not primitives", () => {
    const out = sanitizeInput(input({
      data: { attempt: 2, apiKey: "x", token: "y", status: "ok", nested: { a: 1 } as never, list: [1] as never, fp: null },
    }), []);
    expect(out.data).toEqual({ attempt: 2, status: "ok", fp: null });
  });

  it("keeps only the five id keys and only string values", () => {
    const out = sanitizeInput(input({ ids: { run: "r1", batch: "b1", request: "q1", source: "s1", hist: "h1", extra: "x", num: 5 } as never }), []);
    expect(out.ids).toEqual({ run: "r1", batch: "b1", request: "q1", source: "s1", hist: "h1" });
  });

  it("makes usage numeric-only: junk becomes null and the currency is validated", () => {
    const out = sanitizeInput(input({
      usage: { input: "12" as never, output: Number.NaN, total: Number.POSITIVE_INFINITY, cost: 0.5, estimated: null, currency: "usd; DROP" },
    }), []);
    expect(out.usage).toEqual({ input: null, output: null, total: null, cost: 0.5, estimated: null, currency: "USD" });
  });

  it("keeps reported and estimated cost apart", () => {
    const out = sanitizeInput(input({ usage: { input: 1, output: 2, total: 3, cost: null, estimated: 0.02, currency: "EUR" } }), []);
    expect(out.usage).toMatchObject({ cost: null, estimated: 0.02, currency: "EUR" });
  });

  it("falls back to safe values for a level, feature or action it does not know", () => {
    const out = sanitizeInput({ level: "fatal", feature: "billing", action: "Bad Action!", message: "m" } as never, []);
    expect(out.level).toBe("warn");
    expect(out.feature).toBe("app");
    expect(out.action).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){0,2}$/);
  });
});

describe("caps", () => {
  it("flattens newlines and cuts the message at 240 characters with the count of what was cut", () => {
    expect(clean("one\ntwo\r\nthree")).toBe("one two three");
    const text = "lorem ipsum dolor ".repeat(60);
    const out = clean(text);
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out).toMatch(/…\(\+\d+\)$/);
    expect(out).toBe(`${text.slice(0, 230)}…(+${text.length - 230})`);
  });

  it("cuts data strings at 160, ids at 64 and the key count at 24", () => {
    const keys = [...LOG_DATA_KEYS];
    const data = Object.fromEntries(keys.slice(0, 30).map((k) => [k, "lorem ipsum ".repeat(60)]));
    const out = sanitizeInput(input({ data, ids: { run: "run-".repeat(80) } }), []);
    expect(Object.keys(out.data ?? {}).length).toBeLessThanOrEqual(24);
    for (const v of Object.values(out.data ?? {})) expect(String(v).length).toBeLessThanOrEqual(160);
    expect(out.ids?.run?.length).toBeLessThanOrEqual(64);
  });

  it("keeps the whole serialised input under the entry limit even when every field is long", () => {
    const data = Object.fromEntries([...LOG_DATA_KEYS].slice(0, 24).map((k) => [k, "lorem ipsum ".repeat(60)]));
    const ids = { run: "run-".repeat(80), batch: "batch-".repeat(60) };
    const out = sanitizeInput(input({ message: "lorem ipsum dolor ".repeat(60), data, ids }), []);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(1900);
    expect(Object.keys(out.data ?? {}).length).toBe(24);
  });

  it("treats a string too large to scan as a blob instead of scanning it", () => {
    const huge = "x".repeat(3_000_000);
    expect(clean(huge)).toBe("‹blob 3000000 chars›");
  });
});

describe("guarantees", () => {
  const corpus = [
    "plain", `k ${RQ_KEY}`, `${BEARER} x`, "token=abc123 password: p4ss", "https://u:p@h/x?api_key=zz&b=1",
    `data:image/png;base64,${"QUJD".repeat(60)}`, "A1b2".repeat(60), JWT, "x".repeat(300), "line\none", "‹redacted›", "‹blob 5 chars›",
    "lorem ipsum ".repeat(60), "key: v1 token=v2",
  ];

  it("is idempotent: sanitising twice equals sanitising once", () => {
    for (const text of corpus) {
      const once = sanitizeInput(input({ message: text, data: { reason: text } }), [PLAIN_SECRET]);
      expect(sanitizeInput(once, [PLAIN_SECRET]), text).toEqual(once);
    }
  });

  it("never throws: circular objects, throwing getters, odd types, null", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const getter = { get attempt(): number { throw new Error("boom"); }, status: "ok" };
    expect(() => sanitizeInput(input({ data: { fp: circular as never } }), [])).not.toThrow();
    expect(() => sanitizeInput(input({ data: getter as never }), [])).not.toThrow();
    expect(sanitizeInput(input({ data: getter as never }), []).data).toEqual({ status: "ok" });
    expect(() => sanitizeInput({ level: 5, feature: {}, action: null, message: 42 } as never, [])).not.toThrow();
    expect(() => sanitizeInput(null as never, [])).not.toThrow();
    expect(() => sanitizeInput(input(), [null as never, 5 as never])).not.toThrow();
  });

  it("scrubText masks registered secrets that were registered after the entry was stored", () => {
    expect(scrubText(`stored ${PLAIN_SECRET}`, [PLAIN_SECRET])).not.toContain(PLAIN_SECRET);
    expect(scrubText(`stored ${PLAIN_SECRET}`, [])).toContain(PLAIN_SECRET);
  });

  it("does not let a secret survive in the fold key either", () => {
    const out = sanitizeInput(input({ fold: `same ${RQ_KEY}` }), []);
    expect(JSON.stringify(out)).not.toContain(RQ_KEY);
  });
});
