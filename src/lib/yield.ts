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
