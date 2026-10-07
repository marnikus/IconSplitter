// svgup_meta.test.ts — the metadata store and the rules for a hand edit (design
// §5/§10). The point of this file is the boundary the request draws: the SAME
// policy judges a provider answer and a human edit, so an edit can be saved as a
// draft but can never become exportable metadata unless it satisfies the counts,
// the seven required terms and the word limits. A stale answer is visible, never
// silently reused, and one bad stored record cannot take the rest down with it.
import { describe, expect, it } from "vitest";
import {
  EMPTY_META_STORE, editRecord, editVerdict, isFresh, metaStateOf, parseMetaStore, promptFor, putRecord, recordFor,
} from "../src/lib/svgupload/meta";
import { DEFAULT_UPLOAD_PROMPT, TAG_COUNT, type MetaRecord } from "../src/lib/svgupload/metaprompt";
import { acceptedMeta } from "./helpers/svgupmeta";

const good = () => acceptedMeta();

describe("the store payload", () => {
  it("round-trips the records, the prompt and the model", () => {
    const store = putRecord({ ...EMPTY_META_STORE, model: "gemini-3.1-flash-lite" }, good());
    const parsed = parseMetaStore(JSON.parse(JSON.stringify(store)));
    expect(parsed.records.p1.title).toBe(good().title);
    expect(parsed.model).toBe("gemini-3.1-flash-lite");
    expect(parsed.prompt).toBe(DEFAULT_UPLOAD_PROMPT);
  });

  it("drops junk records one by one instead of losing the whole store", () => {
    const parsed = parseMetaStore({
      records: { p1: good(), p2: { nope: true }, p3: { ...good(), pairId: "other" } },
      prompt: "  ",
      model: 7,
    });
    expect(Object.keys(parsed.records)).toEqual(["p1"]);
    expect(parsed.model).toBe("");
    expect(parsed.prompt).toBe(DEFAULT_UPLOAD_PROMPT);
  });

  it("answers an unknown icon with nothing, not with another icon's text", () => {
    const store = putRecord(EMPTY_META_STORE, good());
    expect(recordFor(store, "p9")).toBeNull();
  });
});

describe("freshness and state", () => {
  it("calls an answer stale exactly when the source fingerprint moved on", () => {
    const record = good();
    expect(isFresh(record, record.sourceFingerprint)).toBe(true);
    expect(isFresh(record, "other")).toBe(false);
    expect(isFresh(record, "")).toBe(true); // the scan could not fingerprint: not a reason to nag
    expect(metaStateOf(record, "other")).toBe("stale");
  });

  it("keeps none / interrupted / rejected distinct", () => {
    expect(metaStateOf(null, "x")).toBe("none");
    expect(metaStateOf({ ...good(), status: "interrupted" }, "x")).toBe("interrupted");
    expect(metaStateOf({ ...good(), status: "rejected" }, "x")).toBe("rejected");
    expect(metaStateOf(good(), good().sourceFingerprint)).toBe("accepted");
  });
});

describe("a hand edit is judged by the same policy", () => {
  it("accepts an edit that satisfies the counts and the word limits", () => {
    const edited = editRecord(good(), { title: "Winner prize symbol for champions. Icon of award and trophy." }, "2026-10-07T12:00:00Z");
    const verdict = editVerdict(edited);
    expect(verdict.ok).toBe(true);
    expect(edited.status).toBe("accepted");
    expect(edited.requestId).toBeNull(); // a hand edit is not attributed to a request
  });

  it("keeps an edit with 39 tags as a rejected DRAFT that can never be exported", () => {
    const edited = editRecord(good(), { tags: good().tags.slice(0, TAG_COUNT - 1) }, "2026-10-07T12:00:00Z");
    expect(edited.status).toBe("rejected");
    expect(edited.tags).toHaveLength(TAG_COUNT - 1);
    expect(editVerdict(edited).lines.join(" ")).toContain(String(TAG_COUNT));
    expect(edited.errors.length).toBeGreaterThan(0);
  });

  it("keeps the missing mandatory terms visible on the edit, not on a hidden copy", () => {
    const edited = editRecord(good(), { tags: good().tags.filter((t) => t !== "web") }, "2026-10-07T12:00:00Z");
    expect(edited.status).toBe("rejected");
    expect(edited.errors.join(" ")).toContain("web");
  });

  it("rejects an empty title instead of exporting an untitled package", () => {
    const edited = editRecord(good(), { title: "" }, "2026-10-07T12:00:00Z");
    expect(edited.status).toBe("rejected");
    expect(editVerdict(edited).ok).toBe(false);
  });
});

describe("the prompt", () => {
  it("names the icon when the template asks for it, and appends it otherwise", () => {
    const withToken = { ...EMPTY_META_STORE, prompt: "Write for {icon} now." };
    expect(promptFor(withToken, "icon-trophy_AI_7_04")).toBe("Write for icon-trophy_AI_7_04 now.");
    expect(promptFor(EMPTY_META_STORE, "icon-trophy_AI_7_04")).toContain("icon-trophy_AI_7_04");
  });
});

describe("a record with no request behind it", () => {
  it("still carries the prompt and the model, so the UI can show what would run", () => {
    const draft: MetaRecord = { ...good(), requestId: null, usage: { input: null, output: null, total: null } };
    expect(parseMetaStore({ records: { p1: draft } }).records.p1.usage.total).toBeNull();
  });
});
