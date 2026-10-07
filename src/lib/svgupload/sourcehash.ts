// sourcehash.ts — the SOURCE's content identity (merge report R02/R03). A
// size:mtime stamp is a hint that a file changed, never proof that it did not:
// an editor that writes in place inside the same second, or a copy over itself,
// leaves the stamp identical while the artwork is different. Every identity this
// tab records — the export record's source hash and the metadata's source
// fingerprint — is therefore the SHA-256 of the bytes that were actually read,
// so an edit that keeps the path, the size and the mtime still invalidates both.
// Pure: the digest is the platform's, and nothing here touches the filesystem.

/** The prefix every content identity carries, so a stamp is never mistaken for one. */
export const SOURCE_HASH_PREFIX = "sha256:";

/** SHA-256 of the exact bytes, lowercase hex — the standard digest, no home-made hash. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True for a value this module produced; an old size:mtime stamp is not one. */
export function isContentHash(value: string): boolean {
  return value.startsWith(SOURCE_HASH_PREFIX);
}
