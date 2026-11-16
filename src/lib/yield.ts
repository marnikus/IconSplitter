// yield.ts — cooperative scheduling helpers to keep UI responsive (RULE 5/7)
// Small tasks (<50ms) keep INP good; heavy pixel work yields between steps

export function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export function yieldToFrame(): Promise<void> {
  return new Promise((r) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(r, 0));
    } else {
      setTimeout(r, 16);
    }
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Time-budgeted yield: cooperative only when the caller has actually held the
 * thread longer than `budgetMs`. Replaces fixed per-step yields that cost a
 * macrotask round-trip each (33 per split — see archive/2026-10-15-split-speed).
 */
export function yieldBudget(budgetMs = 24): () => Promise<void> {
  let last = Date.now();
  return async () => {
    const now = Date.now();
    if (now - last < budgetMs) return;
    await yieldToUI();
    last = Date.now();
  };
}
