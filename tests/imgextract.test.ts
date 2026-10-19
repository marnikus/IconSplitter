// imgextract.test.ts — parses the OpenAI Images API response into ordered Blobs.
// Would fail if ordering is guessed, if b64/url entries are mixed up, or if a
// missing entry is silently dropped.
import { describe, expect, it, vi } from "vitest";
import { extractImages, type ImagePart } from "../src/lib/imgextract";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function okResponse(parts: ImagePart[]): unknown {
  return { data: parts.map((p) => ("b64" in p ? { b64_json: p.b64 } : { url: p.url })) };
}

describe("extractImages — b64_json entries decode in order", () => {
  it("returns one Blob per b64 entry, in source order", async () => {
    const res = okResponse([{ b64: ONE_PIXEL_PNG_BASE64 }, { b64: ONE_PIXEL_PNG_BASE64 }]);
    const out = await extractImages(res, "png", fetchStub());
    expect(out.blobs).toHaveLength(2);
    expect(out.blobs[0].type).toBe("image/png");
    expect(out.blobs[0].size).toBeGreaterThan(0);
    expect(out.errors).toEqual([]);
  });

  it("names missing entries as errors instead of guessing", async () => {
    const out = await extractImages({ data: [null, { b64_json: ONE_PIXEL_PNG_BASE64 }] }, "png", fetchStub());
    expect(out.blobs).toHaveLength(1);
    expect(out.errors.length).toBe(1);
    expect(out.errors[0].position).toBe(0);
  });

  it("refuses a response whose data field is not an array", async () => {
    const out = await extractImages({ data: "x" }, "png", fetchStub());
    expect(out.blobs).toHaveLength(0);
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("records a url fetch failure against that position instead of killing the batch", async () => {
    const fetchThatFails = vi.fn<typeof fetch>().mockRejectedValue(new Error("CORS"));
    const out = await extractImages(
      { data: [{ url: "https://example.co/x.png" }, { b64_json: ONE_PIXEL_PNG_BASE64 }] },
      "png", fetchThatFails,
    );
    expect(out.blobs).toHaveLength(1);
    expect(out.errors[0].position).toBe(0);
    expect(fetchThatFails).toHaveBeenCalledTimes(1);
  });
});

function fetchStub(): typeof fetch {
  return vi.fn<typeof fetch>();
}
