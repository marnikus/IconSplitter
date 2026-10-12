// reviewstatus.ts — THE one review vocabulary (RULE 10/16.4: one definition,
// never a per-tab copy). Extracted from svgmodel so Batch folders' split
// review shares the exact same statuses as the Generate SVG tab: the persisted
// strings, the validator and the values stay identical across tabs.

export type ReviewStatus = "pending" | "approved" | "declined" | "needs-review";

export const REVIEW_VALUES: readonly ReviewStatus[] = ["pending", "approved", "declined", "needs-review"];

export function isReview(value: unknown): value is ReviewStatus {
  return typeof value === "string" && (REVIEW_VALUES as readonly string[]).includes(value);
}
