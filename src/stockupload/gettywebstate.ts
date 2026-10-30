// gettywebstate.ts — what one icon of a Getty run is worth, and nothing else.
// A batch's page reading decides it (a thumbnail or "Ready to submit" means
// taken), an unproven icon is queued for its one retry, and an icon is terminal
// exactly once: uploaded, or failed with Getty's own reason.

import {
  GETTY_WEB_MAX_ATTEMPTS, GETTY_WEB_MAX_BATCH_ICONS, gettyWebFileOrder, gettyWebStem,
} from "../lib/stockupload/gettyweb";
import type { GettyWebIcon, GettyWebRejection, GettyWebResult } from "../lib/stockupload/gettywebclient";
import type { GettyWebIconInput } from "../lib/stockupload/gettywebprep";
import type { GettyWebIconOutcome, GettyWebRunInput } from "./gettywebtransfer";

export interface PreparedIcon {
  index: number;
  icon: GettyWebIcon;
}

/** The run's own bookkeeping: outcomes, attempts, the retry queue and the stop. */
export interface RunState {
  input: GettyWebRunInput;
  maxIcons: number;
  outcomes: GettyWebIconOutcome[];
  done: boolean[];
  attempts: number[];
  queue: number[];
  batches: number;
  completed: number;
  lastError: string | null;
  stopReason: string | null;
}

export function createState(input: GettyWebRunInput): RunState {
  const byIndex = <T>(make: () => T): T[] => Array.from({ length: input.icons.length }, make);
  return {
    input,
    maxIcons: Math.max(1, Math.floor(input.maxIcons ?? GETTY_WEB_MAX_BATCH_ICONS)),
    outcomes: byIndex(() => ({ ok: false, reason: "not uploaded" })),
    done: byIndex(() => false),
    attempts: byIndex(() => 0),
    queue: [],
    batches: 0,
    completed: 0,
    lastError: null,
    stopReason: null,
  };
}

/** An icon that can never be sent (no JPEG, a vanished file): terminal at once. */
export function failIcon(state: RunState, index: number, reason: string): void {
  state.outcomes[index] = { ok: false, reason };
  state.done[index] = true;
}

function acceptIcon(state: RunState, index: number): void {
  state.outcomes[index] = { ok: true, reason: "" };
  state.done[index] = true;
}

/** A named rejection with Getty's id outranks the softer "no thumbnail" note. */
function preferReason(previous: string, next: string): string {
  if (previous === "") return next;
  if (previous.includes("Upload failed") && !next.includes("Upload failed")) return previous;
  return next;
}

/**
 * Queues an icon for its one retry; the retry already spent is what makes the
 * outcome final, so an icon can never bounce between batches for ever.
 */
function queueIcon(state: RunState, index: number, reason: string): void {
  const kept = preferReason(state.outcomes[index]?.reason ?? "", reason);
  state.outcomes[index] = { ok: false, reason: kept };
  if ((state.attempts[index] ?? 0) >= GETTY_WEB_MAX_ATTEMPTS) {
    state.done[index] = true;
    return;
  }
  state.queue.push(index);
}

interface PageLists {
  accepted: readonly string[];
  failed: readonly GettyWebRejection[];
  /** Names Getty received but never marked "Ready to submit". */
  notReady: readonly string[];
  seen: readonly string[];
}

type IconFate = { kind: "accepted" } | { kind: "failed"; reason: string };

/** What the page's own reading says about one icon: taken, or why not. */
function fateOf(icon: GettyWebIconInput, lists: PageLists): IconFate {
  const stems = gettyWebFileOrder(icon.tasks).map((task) => gettyWebStem(task.fileName));
  const hit = (names: readonly string[]) => names.some((name) => stems.includes(gettyWebStem(name)));
  if (hit(lists.accepted)) return { kind: "accepted" };
  const rejected = lists.failed.find((entry) => stems.includes(gettyWebStem(entry.name)));
  if (rejected) {
    const id = rejected.id ? ` (${rejected.id})` : "";
    return { kind: "failed", reason: `Getty reports "Upload failed" for ${rejected.name}${id}` };
  }
  const name = lists.notReady.find((entry) => stems.includes(gettyWebStem(entry))) ?? stems[0] ?? "this icon";
  // A `seen` list that lacks the file is a different fact from a card Getty has
  // but never validated; neither is an upload, and the second one is the truth.
  if (lists.seen.length > 0 && !hit(lists.seen)) {
    return { kind: "failed", reason: `Getty did not list ${name} — not counted as uploaded` };
  }
  return {
    kind: "failed",
    reason: `Getty does not show its "Ready to submit" icon for ${name} — not counted as uploaded`,
  };
}

/** Marks every icon of a batch from the page's own lists — never optimistically. */
export function settleBatch(state: RunState, prepared: readonly PreparedIcon[], res: GettyWebResult): void {
  const lists: PageLists = {
    accepted: res.accepted ?? [], failed: res.failed ?? [],
    notReady: res.notReady ?? [], seen: res.seen ?? [],
  };
  for (const entry of prepared) {
    const fate = fateOf(state.input.icons[entry.index], lists);
    if (fate.kind === "accepted") { acceptIcon(state, entry.index); continue; }
    queueIcon(state, entry.index, res.ok ? fate.reason : `${fate.reason} (${res.reason})`);
  }
}

/** Every icon gets exactly one outcome, even the ones the run never reached. */
export function finalOutcome(state: RunState): {
  ok: boolean; reason: string; icons: GettyWebIconOutcome[]; failed: number;
  batches: number; completed: number; batchError: string | null;
} {
  const icons = state.input.icons.map((_icon, index) => {
    if (state.done[index] === true) return state.outcomes[index];
    const reason = state.stopReason ?? (state.input.signal.aborted ? "upload cancelled" : state.outcomes[index].reason);
    return { ok: false, reason };
  });
  const failed = icons.filter((entry) => !entry.ok);
  return {
    ok: failed.length === 0,
    reason: state.stopReason ?? failed[0]?.reason ?? "",
    icons, failed: failed.length,
    batches: state.batches, completed: state.completed, batchError: state.lastError,
  };
}
