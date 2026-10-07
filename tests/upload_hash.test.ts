// RULE 8 — fingerprints run for real: SHA-256 over bytes and over UTF-8
// text, against published test vectors.
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexText } from "../src/lib/upload/hash";

const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("sha256Hex — published vectors", () => {
  it("hashes the empty input", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(SHA256_EMPTY);
  });

  it("hashes bytes (the SHA-256 'abc' vector)", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(SHA256_ABC);
  });

  it("is 64 lowercase hex chars", async () => {
    const hex = await sha256Hex(new Uint8Array([0, 1, 2, 250, 255]));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different inputs", async () => {
    const a = await sha256Hex(new Uint8Array([1]));
    const b = await sha256Hex(new Uint8Array([2]));
    expect(a).not.toBe(b);
  });
});

describe("sha256HexText — UTF-8 text", () => {
  it("matches the byte hash of the UTF-8 encoding", async () => {
    expect(await sha256HexText("abc")).toBe(SHA256_ABC);
    expect(await sha256HexText("")).toBe(SHA256_EMPTY);
  });

  it("encodes non-ASCII as UTF-8, not UTF-16 code units", async () => {
    const text = "ü — ✓";
    expect(await sha256HexText(text)).toBe(await sha256Hex(new TextEncoder().encode(text)));
    expect(await sha256HexText(text)).not.toBe(await sha256Hex(new Uint8Array([0xfc])));
  });
});
