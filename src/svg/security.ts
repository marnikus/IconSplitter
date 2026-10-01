// security.ts — final redaction boundary for UI and persisted safe-error fields.
// Callers pass fixed summaries; provider bodies and credentials are never shown.

const CREDENTIAL = /(?:rq_(?:live|sk)_[a-z0-9_-]{8,}|sk-[a-z0-9_-]{16,})/gi;
const DATA_IMAGE = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;

export function redactSecrets(text: string, secret = ""): string {
  const withoutKey = secret ? text.split(secret).join("[redacted]") : text;
  return withoutKey.replace(CREDENTIAL, "[redacted]").replace(DATA_IMAGE, "[image data removed]").slice(0, 300);
}

export function safeErrorText(text: unknown): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  return redactSecrets(text.trim());
}
