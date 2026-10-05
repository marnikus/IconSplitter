// logfix.ts — shared fixtures for the log tests: valid entries/inputs and
// secret-shaped strings assembled from parts, so no key-shaped literal is
// committed (secret_hygiene scans every file, tests included).
import type { LogEntry, LogInput } from "../../src/lib/logentry";

export const AT = "2026-10-05T10:00:00.123Z";

export const RQ_KEY = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");
export const SK_KEY = ["sk", "abcDEF1234567890xyzXYZ"].join("-");
export const PLAIN_SECRET = ["plain", "secret", "ValueWithNoKnownShape"].join("-");
export const BEARER = ["Bearer", "abcDEF123456xyz.token"].join(" ");
export const JWT = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV"].join(".");

export function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    v: 1, id: "s1-1", at: AT, sid: "s1", level: "info", feature: "svg", action: "run.start",
    message: "hello", ids: {}, data: {}, ...over,
  };
}

export function input(over: Partial<LogInput> = {}): LogInput {
  return { level: "info", feature: "svg", action: "run.start", message: "hello", ...over };
}

/** n distinct entries, ids s1-1…s1-n, one millisecond apart. */
export function entries(n: number, over: (i: number) => Partial<LogEntry> = () => ({})): LogEntry[] {
  return Array.from({ length: n }, (_, i) => entry({
    id: `s1-${i + 1}`, at: new Date(Date.parse(AT) + i).toISOString(), message: `message ${i + 1}`, ...over(i + 1),
  }));
}
