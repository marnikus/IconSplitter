// svgimgreg.ts — AI source image regeneration (2026-10-16, user request):
// the version folder beside each pair, the version history the pair file keeps
// (I-54 additive fields — nothing is deleted), the never-overwrite version
// rule, the Images API response parse, and the main-version resolution the AI
// thumb loads. Pure: every rule lives here; IO and UI glue do not.
// Wire facts verified 2026-10-16 (archive/2026-10-16-image-regen): the request
// is lib/svgconnections' buildImageBody; the response is
// `{ created, data: [{ b64_json?, url? }] }`. 2026-10-19 fix
// (archive/2026-10-19-image-regen-fix): the image wait floor, the main image
// the SVG generation reads, and the honest texts of a run.

/** The subfolder holding a pair's regenerated AI images (user's naming). */
export const IMAGE_REGEN_DIR = "AI source regeneration versions";

/** `<dir>/AI source regeneration versions` — beside the pair's own files. */
export function imageRegenDir(relDirPath: string): string {
  return relDirPath === "" ? IMAGE_REGEN_DIR : `${relDirPath}/${IMAGE_REGEN_DIR}`;
}

/** A regenerated AI image's file name: the stem plus an explicit version. */
export function imageRegenFileName(stem: string, version: number): string {
  return `${stem}_v${version}.png`;
}

export interface ImageVersion {
  version: number;
  /** Path relative to the scanned root. */
  file: string;
  status: "done" | "failed";
  prompt: string;
  model: string;
  requestId: string | null;
  error: string | null;
  updatedAt: string;
}

/** A stored history -> the safe list; junk entries are dropped (RULE 13). */
export function parseImageVersions(raw: unknown): ImageVersion[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => entryOf(entry));
}

const versionOf = (r: Record<string, unknown>): number => {
  const n = r.version;
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.round(n) : 0;
};
const strField = (r: Record<string, unknown>, key: string): string => (typeof r[key] === "string" ? (r[key] as string) : "");
const strOrNull = (r: Record<string, unknown>, key: string): string | null => (typeof r[key] === "string" ? (r[key] as string) : null);

function entryOf(entry: unknown): ImageVersion[] {
  const r = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
  const version = versionOf(r);
  const file = strField(r, "file");
  if (version === 0 || file === "") return [];
  return [{
    version, file,
    status: r.status === "failed" ? "failed" : "done",
    prompt: strField(r, "prompt"), model: strField(r, "model"),
    requestId: strOrNull(r, "requestId"), error: strOrNull(r, "error"),
    updatedAt: strField(r, "updatedAt"),
  }];
}

/**
 * The next version to write: one past the highest version found on disk OR in
 * the pair's history — a regeneration can never overwrite an older image.
 */
export function nextImageVersion(stem: string, history: readonly ImageVersion[], existingNames: readonly string[]): number {
  let max = 0;
  for (const v of history) max = Math.max(max, v.version);
  const own = new RegExp(`^${stem.replace(/[.*+?${}()|[\]\\]/g, "\\$&")}_v(\\d+)\\.png$`);
  for (const name of existingNames) {
    const m = own.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** The documented response, reduced to its first image — or null. */
export function parseImageResponse(raw: unknown): { b64: string } | { url: string } | null {
  const first = firstImageOf(raw);
  if (first === null) return null;
  const b64 = (first as { b64_json?: unknown }).b64_json;
  if (typeof b64 === "string" && b64 !== "") return { b64 };
  const url = (first as { url?: unknown }).url;
  return typeof url === "string" && url !== "" ? { url } : null;
}

function firstImageOf(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = (raw as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  return typeof first === "object" && first !== null ? (first as Record<string, unknown>) : null;
}

/** An inline image's base64 payload -> the PNG blob the tab writes. */
export function b64ToBlob(b64: string, type = "image/png"): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * The AI file a row SHOWS: the user's chosen regeneration when it is a done
 * version, else the original AI image (legacy behaviour, I-54 fallback).
 */
export function preferredImagePath(versions: readonly ImageVersion[], preferred: number | null, fallback: string): string {
  if (preferred === null) return fallback;
  const chosen = versions.find((v) => v.version === preferred && v.status === "done");
  return chosen?.file ?? fallback;
}

/** The two pair-file fields that name the main image (structural: no cycle with pairmeta). */
export interface ImageMain {
  imageVersions: readonly ImageVersion[];
  imagePreferred: number | null;
}

/**
 * THE file a pair's AI source is (RC8): the row shows it and the SVG
 * generation vectorizes it — one rule, so the two can never disagree.
 */
export function mainImageOf(meta: ImageMain | null, original: string): string {
  return meta === null ? original : preferredImagePath(meta.imageVersions, meta.imagePreferred, original);
}

/**
 * Field ownership (RC6): the image fields belong to the image writer. An SVG
 * save built from an older copy takes them from the LATEST in-memory copy, so
 * a regeneration that landed meanwhile is never dropped.
 */
export function withImagesOf<T extends ImageMain>(meta: T, latest: ImageMain | null): T {
  return latest === null ? meta : { ...meta, imageVersions: latest.imageVersions, imagePreferred: latest.imagePreferred };
}

/** An image arrives in one piece at the end — never wait less than this (RC7). */
export const IMAGE_WAIT_FLOOR_MS = 300_000;

/** The wait for one image request: the stall window, raised to the image floor. */
export function imageWaitMs(stallMs: number): number {
  return Math.max(stallMs, IMAGE_WAIT_FLOOR_MS);
}

/** The reason the LAST attempt failed, or null when it did not (the row strip line). */
export function lastImageFailure(versions: readonly ImageVersion[]): string | null {
  const last = versions.at(-1);
  if (last === undefined || last.status !== "failed") return null;
  return last.error !== null && last.error !== "" ? last.error : "unknown error";
}

export interface RegenTally {
  total: number;
  done: number;
  failed: number;
  /** The first failure's reason, shown with the count (RULE 4). */
  reason: string | null;
}

/** The outcome toast: what landed, what failed and why, what was never sent. */
export function regenOutcome(t: RegenTally): { msg: string; err: boolean } {
  const err = t.failed > 0;
  const why = t.reason === null ? "" : `: ${t.reason}`;
  const notSent = t.total - t.done - t.failed;
  if (notSent > 0) return { msg: `Stopped — ${t.done} regenerated, ${t.failed} failed, ${notSent} not sent${why}`, err };
  if (t.done === 0) return { msg: `No AI source was regenerated${t.reason === null ? "" : ` — ${t.reason}`}`, err: true };
  if (err) return { msg: `Regenerated ${t.done} of ${t.total} AI sources — ${t.failed} failed${why}`, err };
  return t.done === 1
    ? { msg: "Regenerated 1 AI source — it is now the main image", err }
    : { msg: `Regenerated ${t.done} AI sources — each is now the main image`, err };
}
