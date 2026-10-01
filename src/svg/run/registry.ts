// run/registry.ts — process-local source lock; prevents duplicate batches and
// distinguishes live requests from interrupted requests during an in-session rescan.

const activeSources = new Set<string>();

export function reserveSources(sourceIds: string[]): void {
  sourceIds.forEach((id) => activeSources.add(id));
}

export function releaseSources(sourceIds: string[]): void {
  sourceIds.forEach((id) => activeSources.delete(id));
}

export function isSvgSourceRunning(sourceId: string): boolean {
  return activeSources.has(sourceId);
}
