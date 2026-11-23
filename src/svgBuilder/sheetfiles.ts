// sheetfiles.ts — reading and writing the builder's JSON files under
// `_artboard_sheets` (2026-11-22): template.json, sheet.json, metadata.json. A
// write remembers the text's fingerprint (filesigstore.ts), so the app can tell
// its own copy from a file changed outside it; a file from before fingerprints
// that differs is copied into its folder's `.removed versions` before the app
// replaces it — nothing a person wrote is ever lost.
import { ensureDirPath, probePath, TRASH_DIR, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { rememberSig } from "./filesigstore";

export interface SheetFileRead { text: string; modified: number }

const split = (path: string) => ({ dir: path.slice(0, path.lastIndexOf("/")), name: path.slice(path.lastIndexOf("/") + 1) });

/** JSON as the app writes it: two-space indent, one trailing newline. */
export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** A file's text and last change (ms); null when missing or unreadable. */
export async function readSheetFile(root: DirHandleLike, path: string): Promise<SheetFileRead | null> {
  const { dir, name } = split(path);
  const folder = await probePath(root, dir);
  const handle = folder === null ? null : await tryGetFile(folder, name);
  if (handle === null) return null;
  try {
    const file = await handle.getFile();
    return { text: await file.text(), modified: file.lastModified };
  } catch {
    return null;
  }
}

/** Writes the file whole and remembers its fingerprint. */
export async function writeSheetFile(root: DirHandleLike, path: string, text: string): Promise<void> {
  const { dir, name } = split(path);
  await writeFileOverwrite(await ensureDirPath(root, dir), name, new Blob([text], { type: "application/json" }));
  rememberSig(path, text);
}

/** A copy into the file's folder's `.removed versions` (`<name>~<stamp>`) before the app replaces it. */
export async function backupSheetFile(root: DirHandleLike, path: string, text: string, stamp: string): Promise<void> {
  const { dir, name } = split(path);
  await writeFileOverwrite(await ensureDirPath(root, `${dir}/${TRASH_DIR}`), `${name}~${stamp}`, new Blob([text], { type: "application/json" }));
}
