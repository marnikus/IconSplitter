// Byte primitives shared by JPEG/IPTC resource carriers.
export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
export const decodeUtf8 = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
export function joinBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
export function bigEndian(value: number, width: number): Uint8Array {
  const bytes = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) { bytes[i] = value & 255; value = Math.floor(value / 256); }
  return bytes;
}
export function readBigEndian(bytes: Uint8Array, at: number, width: number): number {
  if (at < 0 || at + width > bytes.length) throw new Error("truncated metadata length");
  let value = 0;
  for (let i = 0; i < width; i++) value = value * 256 + bytes[at + i];
  return value;
}
/** Legacy field projection only. Full accepted strings always remain in XMP. */
export function utf8Prefix(text: string, limit: number): string {
  let result = "";
  let size = 0;
  for (const char of text) {
    size += utf8(char).length;
    if (size > limit) break;
    result += char;
  }
  return result;
}
