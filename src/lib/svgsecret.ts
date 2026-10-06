// svgsecret.ts — API-key hygiene for SVG generation (RULE 20 + prompt §7).
// Owns: masking a key for display, stripping it out of any text that is about
// to be logged, exported or shown, and the pattern the repository-hygiene test
// uses to prove no key was committed. No key value ever lives in this file.

/** Shaped like a Requesty key (rq_live_… / rq_test_…) or a generic provider key. */
const KEY_SHAPE = /\b(?:rq_(?:live|test)_|sk-)[A-Za-z0-9_-]{12,}\b/g;
const MASK = "rq_••••••••••••••";

/** "rq_live_Ab3…9Zx" -> "rq_live_••••••••••9Zx" (first 8 + last 4 kept). */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") return "not set";
  if (trimmed.length <= 12) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 8)}${"•".repeat(10)}${trimmed.slice(-4)}`;
}

/** True when the text looks like it carries a real key (hygiene gate input). */
export function containsSecret(text: string): boolean {
  return findSecrets(text).length > 0;
}

/** Every key-shaped literal in the text, so a caller can report where it was. */
export function findSecrets(text: string): string[] {
  return [...text.matchAll(KEY_SHAPE)].map((m) => m[0]);
}

/** Replaces every key-shaped literal with a fixed mask — safe for logs/errors. */
export function redact(text: string, key?: string): string {
  const masked = text.replace(KEY_SHAPE, MASK);
  if (!key || key.trim() === "") return masked;
  return masked.split(key.trim()).join(MASK);
}

/** Header value for the provider call — never logged, never persisted. */
export function authHeader(key: string): string {
  return `Bearer ${key.trim()}`;
}
