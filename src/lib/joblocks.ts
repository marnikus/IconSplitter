// Atomic session-local resource leases. Acquisition is all-or-nothing; a late
// owner's cleanup can never unlock a resource that a newer owner now holds.
export function acquireResources(locks: Map<string, string>, owner: string, keys: readonly string[]): boolean {
  if (keys.some((key) => locks.has(key))) return false;
  for (const key of keys) locks.set(key, owner);
  return true;
}

export function releaseResources(locks: Map<string, string>, owner: string, keys: readonly string[]): void {
  for (const key of keys) if (locks.get(key) === owner) locks.delete(key);
}

/** Skip a conflicting head, but preserve ordering between conflicting waiters. */
export function availableJob<T extends { ids: string[] }>(queue: readonly T[], blocked: (id: string) => boolean): T | null {
  const earlier = new Set<string>();
  for (const item of queue) {
    if (!item.ids.some((id) => blocked(id) || earlier.has(id))) return item;
    for (const id of item.ids) earlier.add(id);
  }
  return null;
}
