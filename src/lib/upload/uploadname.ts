// uploadname.ts — human-readable upload file stems derived from Title +
// Description or manual edits (2026-11-19). No commas, dots, spaces or
// punctuation; words joined by `_`; capped at <= 180 chars strictly on a
// complete word boundary so the last word is never sliced halfway.

export const UPLOAD_NAME_MAX_CHARS = 180;

const STRIP_EXT_RE = /\.(?:svg|jpe?g|png|eps|zip)$/i;

function asciiWords(raw: string): string[] {
  const folded = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return folded.match(/[A-Za-z0-9]+/g) ?? [];
}

function joinWholeWords(words: readonly string[], maxChars: number): string {
  const cap = Math.max(1, Math.floor(maxChars));
  let acc = "";
  for (const word of words) {
    if (acc === "") {
      acc = word.length > cap ? word.slice(0, cap) : word;
      if (word.length > cap) break;
      continue;
    }
    if (acc.length + 1 + word.length > cap) break;
    acc = `${acc}_${word}`;
  }
  return acc;
}

/** Builds the underscore-joined upload stem from metadata Title + Description. */
export function buildUploadName(
  input: { title: string; description: string },
  maxChars = UPLOAD_NAME_MAX_CHARS,
): string {
  const words = [...asciiWords(input.title), ...asciiWords(input.description)];
  return joinWholeWords(words, maxChars);
}

/** Sanitizes a manual upload stem: drops accidental file extensions, commas, dots & spaces. */
export function sanitizeUploadName(raw: string, maxChars = UPLOAD_NAME_MAX_CHARS): string {
  const trimmed = raw.trim();
  const withoutExt = /[A-Za-z0-9]/.test(trimmed.replace(STRIP_EXT_RE, ""))
    ? trimmed.replace(STRIP_EXT_RE, "")
    : trimmed;
  return joinWholeWords(asciiWords(withoutExt), maxChars);
}

/** Returns the sanitized uploadName when non-empty, else the item's working stem. */
export function effectiveExportStem(workName: string, uploadName: string | null | undefined): string {
  const clean = typeof uploadName === "string" ? sanitizeUploadName(uploadName) : "";
  return clean !== "" ? clean : workName;
}

/** Shrinks an underscore-joined stem to `<= maxChars` strictly at a whole-word boundary. */
export function shrinkUploadNameToBudget(stem: string, maxChars: number): string {
  const clean = sanitizeUploadName(stem, UPLOAD_NAME_MAX_CHARS);
  if (clean.length <= maxChars) return clean;
  return joinWholeWords(clean.split("_").filter(Boolean), Math.max(8, maxChars));
}
