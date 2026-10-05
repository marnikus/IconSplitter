// fakestorage.ts — an in-memory Storage that counts writes and can be told to
// refuse them (quota, private mode) or reads (blocked). Installed with
// vi.stubGlobal("localStorage", …): this DOM's Storage is a proxy that cannot be
// spied on reliably, and a stand-in lets a test assert on writes instead of
// guessing at them.
export class FakeStorage implements Storage {
  private map = new Map<string, string>();
  /** Every successful write: key and value length, in order. */
  writes: Array<[string, number]> = [];
  failSet = false;
  failGet = false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    if (this.failGet) throw new Error("storage blocked");
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new DOMException("The quota has been exceeded", "QuotaExceededError");
    this.writes.push([key, value.length]);
    this.map.set(key, String(value));
  }

  /** Writes of one key. */
  writesOf(key: string): number {
    return this.writes.filter(([k]) => k === key).length;
  }
}
