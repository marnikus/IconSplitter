// picker.ts — File System Access API entry point (Chrome/Edge).
// Owns: folder picking with honest cancellation; unsupported browsers get a
// clear "not supported" answer (RULE 4), never a silent dead end.

import type { DirHandleLike } from "../lib/fs";

interface PickerWindow {
  showDirectoryPicker?(opts?: { mode?: string }): Promise<unknown>;
}

export function fsSupported(): boolean {
  return typeof (window as unknown as PickerWindow).showDirectoryPicker === "function";
}

/** Opens the folder picker; null when the user cancels or API is missing. */
export async function pickDirectory(): Promise<DirHandleLike | null> {
  const w = window as unknown as PickerWindow;
  if (!w.showDirectoryPicker) return null;
  try {
    return (await w.showDirectoryPicker({ mode: "readwrite" })) as DirHandleLike;
  } catch {
    return null; // AbortError: user closed the dialog
  }
}

/** Re-asks permission after a handle was restored from storage. */
export async function ensurePermission(handle: DirHandleLike): Promise<boolean> {
  const h = handle as unknown as {
    queryPermission?(d: { mode: string }): Promise<string>;
    requestPermission?(d: { mode: string }): Promise<string>;
  };
  if (!h.queryPermission || !h.requestPermission) return true;
  try {
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}
