// effortlimits.ts — what the selected reasoning level may change, and what it
// may not. It changes the STALL WINDOW only: how long a connection may stay
// silent before it is presumed dead. It never caps the batch, never shortens
// the wait and never truncates the work — a reasoning request is allowed to
// take as long as it takes, and the user's "images per request" stays exactly
// what they configured (prompt 2026-10-05; this reverses the earlier
// medium=2 / high=1 cap, which reduced the work instead of waiting for it).
//
// The window exists for one reason: a half-open TCP connection or a proxy that
// dropped us fires no error at all, so without it the tab would wait forever.
// It is measured between BYTES, never from the start: every delta, keepalive
// comment or [DONE] resets it, which is why proxies may cut an idle socket at
// 60-100 s but never a stream that keeps talking.
//
// Floors (verified 2026-10-05 against the latency guidance for hosted
// reasoning models and the idle limits of common proxies): a low-effort answer
// can still think for minutes, and the proxies in front of the provider cut an
// idle socket long before a big answer is finished. Sources recorded in
// docs/archive/2026-10-05-svg-long-requests/design.md.

import { effortOf, type Effort, type ModelCaps, type SamplingParams } from "./modelcaps";

export interface EffortRule {
  /** The shortest stall window this tier may run with (ms). */
  stallMs: number;
}

export const EFFORT_RULES: Readonly<Record<Effort, EffortRule>> = {
  low: { stallMs: 120_000 },
  medium: { stallMs: 300_000 },
  high: { stallMs: 600_000 },
  xhigh: { stallMs: 600_000 },
};

/** The rule in force, or null when no effort is sent (the provider's default). */
export function effortRule(caps: ModelCaps, params: SamplingParams): EffortRule | null {
  const effort = effortOf(caps, params.effort);
  return effort === null ? null : EFFORT_RULES[effort];
}

/** The stall window really used: the configured one, raised to the tier floor. */
export function effectiveStallMs(configured: number, caps: ModelCaps, params: SamplingParams): number {
  const rule = effortRule(caps, params);
  return rule === null ? configured : Math.max(configured, rule.stallMs);
}

/** "300s stall (medium floor)" when the tier raised it, otherwise "120s stall". */
export function stallLabel(configured: number, caps: ModelCaps, params: SamplingParams): string {
  const raised = effectiveStallMs(configured, caps, params);
  if (raised <= configured) return `${Math.round(configured / 1000)}s stall`;
  return `${Math.round(raised / 1000)}s stall (${effortOf(caps, params.effort)} floor)`;
}

/** What the tier raised, said without ever implying the batch was trimmed. */
export function stallNote(configured: number, caps: ModelCaps, params: SamplingParams): string | null {
  const effort = effortOf(caps, params.effort);
  const raised = effectiveStallMs(configured, caps, params);
  if (effort === null || raised <= configured) return null;
  return `effort ${effort} raises the stall window to ${Math.round(raised / 1000)}s — `
    + "no data for that long means the connection is gone, not that the answer was slow. "
    + "The batch itself is sent as configured, however long it takes.";
}

/** Why the stream stopped and what the user can do — never a fake failure. */
export function stallHint(caps: ModelCaps, params: SamplingParams, waitedMs: number): string {
  const seconds = Math.round(waitedMs / 1000);
  const effort = effortOf(caps, params.effort);
  const tier = effort === null ? "" : ` at effort ${effort}`;
  return `no data for ${seconds}s${tier} — the connection looks dead, so the outcome is unknown `
    + "and the request has not been resent. Check the provider's usage before retrying.";
}
