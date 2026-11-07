// commit.ts — putting a finished sheet into the user's own folder (design §5.6).
//
// The builder writes ONE folder, `builder/`, beside the icons it read. Three rules
// it will not break:
//   * Create-only. An existing file is never overwritten — a second export of the
//     same sheet gets `-1`, `-2`, … so the previous export the user may have
//     already sent somewhere is still there (RULE 23: a delivery is not a rewrite).
//   * Inside the folder. The name is sanitised, so a caption or a folder name can
//     never turn into a path that writes outside `builder/`.
//   * Reported. A failure comes back as a reason; the caller says it out loud.
//
// The walk of the library already ignores `builder/`, so a committed sheet is never
// read back in as artwork (builder/scan).

import type { DirHandleLike } from "../lib/fs";

/** The one folder the builder writes into. */
export const BUILDER_OUT_DIR = "builder";

export interface CommitOk {
  ok: true;
  /** The name actually written (possibly suffixed). */
  name: string;
}

export interface CommitFail {
  ok: false;
  reason: string;
}

export type CommitResult = CommitOk | CommitFail;

/** A file name that cannot escape the folder or upset a filesystem. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "")          // no path separators at all
    // Characters Windows refuses, plus every C0 control character.
    .replace(/[<>:"|?*]/g, "")
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .replace(/^\.+/, "")            // no leading dots (hidden / traversal)
    .trim();
  return cleaned === "" ? "sheet.svg" : cleaned;
}

/** The first free name: `sheet.svg`, then `sheet-1.svg`, `sheet-2.svg`, … */
export function freeNameIn(taken: ReadonlySet<string>, wanted: string): string {
  if (!taken.has(wanted)) return wanted;
  const dot = wanted.lastIndexOf(".");
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : "";
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${stem}-${index}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Bounded: falling back to the stem with a long counter is still better than
  // overwriting (the caller reports the name it got).
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * Writes `content` into `builder/` under a name that is free. Never overwrites.
 *
 * `content` is a STRING for an SVG (encoded as UTF-8 by the writable) or a BLOB
 * for anything binary — a PNG read back through `.text()` would be mangled, so the
 * bytes go straight to the stream.
 */
export async function commitSheet(
  root: DirHandleLike, wantedName: string, content: string | Blob,
): Promise<CommitResult> {
  try {
    const folder = await root.getDirectoryHandle(BUILDER_OUT_DIR, { create: true });
    if (!(await isDirectory(folder))) return { ok: false, reason: `${BUILDER_OUT_DIR}/ is a file, not a folder` };
    const taken = await namesIn(folder);
    const name = freeNameIn(taken, safeFileName(wantedName));
    const file = await folder.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(typeof content === "string" ? new Blob([content], { type: "image/svg+xml" }) : content);
    await writable.close();
    return { ok: true, name };
  } catch {
    return { ok: false, reason: `Could not write into ${BUILDER_OUT_DIR}/ — the folder may be read-only` };
  }
}

/** Whether the handle really is a directory (a same-named file is not). */
async function isDirectory(handle: DirHandleLike): Promise<boolean> {
  const kind = (handle as unknown as { kind?: string }).kind;
  if (kind !== undefined) return kind === "directory";
  return true;
}

/** Every name already in the folder (an unreadable listing is treated as empty). */
async function namesIn(folder: DirHandleLike): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    for await (const [name] of folder.entries()) names.add(name);
  } catch {
    return names;
  }
  return names;
}
