// events.ts — refresh signal for durable SVG metadata changes made by UI or history.

const listeners = new Set<() => void>();

export function subscribeSvgChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifySvgChanges(): void {
  listeners.forEach((listener) => listener());
}
