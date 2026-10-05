// runevent.ts — what a generation run tells the outside world (prompt §4/§17).
// One union, no behaviour: the runner and the sender emit it, the tab's state
// mapping and the log tap read it. A consumer ignores kinds it does not know,
// so a new kind never breaks an old reader.

import type { SvgSidecar } from "../lib/svgfile";
import type { Failure, Usage } from "../lib/svgrequest";

export type RunEvent =
  | { kind: "batch-start"; batchId: string; count: number; batches: number; cols: number; rows: number; composite: string; hash: string }
  /** One attempt is about to be posted; `fp` is MEASURED from the exact object, `chars` is the body length. */
  | { kind: "request-sent"; batchId: string; attempt: number; of: number; fp: string; chars: number }
  /** An attempt failed in a way that is safe to repeat; `error` is already redacted. */
  | { kind: "request-retry"; batchId: string; attempt: number; of: number; failure: Failure["kind"]; status: number | null; waitMs: number; error: string }
  | { kind: "request-ok"; batchId: string; attempt: number; status: number; ms: number; requestId: string | null; usage: Usage }
  | { kind: "item-start"; batchId: string; position: number; sourceId: string }
  | { kind: "item-saved"; batchId: string; position: number; sourceId: string; version: number; icons: number; warnings: string[]; usage: Usage; sidecar: SvgSidecar | null }
  | { kind: "item-failed"; batchId: string; position: number; sourceId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null }
  | { kind: "request-failed"; batchId: string; error: string; failure: Failure["kind"]; retryAfterMs: number | null; count: number }
  | { kind: "batch-done"; batchId: string; saved: number; failed: number; missing: number }
  | { kind: "cancelled" };
