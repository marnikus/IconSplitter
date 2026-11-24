// renamefeedback.ts — per-item inline status feedback for UploadNameField across
// SVG builder, SVG to upload, and Stock upload. Increments `seq` on every user
// action so even repeated clicks with the exact same name always give a fresh,
// unmistakable response right next to the row's rename controls.

export interface ItemRenameFeedback {
  readonly id: string;
  readonly msg: string;
  readonly err: boolean;
  readonly seq: number;
}

export interface SingleRenameMsgArgs {
  readonly stored: string | null;
  readonly workName: string;
  readonly target: string;
  readonly diskRenamed: boolean;
  readonly unchanged: boolean;
}

const byId = new Map<string, ItemRenameFeedback>();
const listeners = new Set<() => void>();
let seq = 0;

function notify(): void {
  for (const fn of listeners) fn();
}

export function publishRenameFeedback(id: string, msg: string, err = false): ItemRenameFeedback {
  seq += 1;
  const entry: ItemRenameFeedback = { id, msg, err, seq };
  byId.set(id, entry);
  notify();
  return entry;
}

export function getRenameFeedback(id: string): ItemRenameFeedback | null {
  return byId.get(id) ?? null;
}

export function subscribeRenameFeedback(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function clearRenameFeedback(): void {
  if (byId.size === 0) return;
  byId.clear();
  notify();
}

export function singleRenameMessage(a: SingleRenameMsgArgs): string {
  if (a.unchanged) {
    return a.stored === null
      ? `Already using work name ${a.workName} (no changes needed)`
      : `Upload file name is already ${a.target} (no changes needed)`;
  }
  if (a.diskRenamed) {
    return a.stored === null ? `Exported files reset to ${a.workName}` : `Exported files renamed to ${a.target}`;
  }
  return a.stored === null ? `Upload file name reset to ${a.workName}` : `Upload file name saved for export: ${a.target}`;
}

export function announceItemRename(
  id: string,
  msg: string,
  say: (text: string, err?: boolean) => void,
  err = false,
): void {
  publishRenameFeedback(id, msg, err);
  say(msg, err);
}
