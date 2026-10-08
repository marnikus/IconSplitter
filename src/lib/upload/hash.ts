// hash.ts — content fingerprints for the "SVG to upload" tab (RULE 3):
// SHA-256 over bytes, lowercase hex. Selective re-export keys on these
// (design §4.4); fingerprints never leave the browser.

/** SHA-256 of the bytes, lowercase hex (64 chars). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of the UTF-8 encoding of the text. */
export async function sha256HexText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}
