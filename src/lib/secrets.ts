// secrets.ts — secret hygiene for the Requesty API key (design D3). The raw
// key is displayed masked and scrubbed from any text that could reach logs,
// toasts, reports, exports or error surfaces. No storage lives here.

/** Display form: recognisable prefix + last four characters, dots between. */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length < 8) return "•".repeat(Math.max(key.length, 4));
  const prefix = key.slice(0, key.indexOf("_") + 1 || 4);
  return `${prefix}••••••••••${key.slice(-4)}`;
}

/** Every occurrence of the key replaced; empty key leaves text untouched. */
export function redact(text: string, key: string): string {
  if (!key) return text;
  return text.split(key).join("[redacted]");
}
