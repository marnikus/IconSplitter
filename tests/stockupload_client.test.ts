import { afterEach, describe, expect, it, vi } from "vitest";
import { connectCompanion, extensionRuntime } from "../src/lib/stockupload/native";
import { readStockSelection } from "../src/lib/stockupload/selection";
afterEach(() => vi.unstubAllGlobals());
describe("browser/native boundary", () => {
  it("rejects ordinary web/file pages and only opens the extension's internal owned channel", async () => {
    expect(extensionRuntime()).toBeNull(); expect(() => connectCompanion()).toThrow(/optional extension/);
    const id = "a".repeat(32), listeners: ((value: unknown) => void)[] = [], sent: Record<string, unknown>[] = [];
    const port = { postMessage: (m: Record<string, unknown>) => { sent.push(m); }, disconnect: vi.fn(), onMessage: { addListener: (fn: (v: unknown) => void) => listeners.push(fn) }, onDisconnect: { addListener: vi.fn() } };
    vi.stubGlobal("location", { origin: `chrome-extension://${id}` }); vi.stubGlobal("chrome", { runtime: { id, connect: () => port } });
    expect(extensionRuntime()?.id).toBe(id); const client = connectCompanion();
    const hello = client.hello(); listeners.forEach(fn => fn({ id: sent[0].id, ok: true, result: { v: 1, nonce: "a".repeat(64) } })); await hello;
    const result = client.call("chunk"); listeners.forEach(fn => fn({ id: sent[1].id, ok: false })); await expect(result).rejects.toThrow(/failed/); client.close(); expect(port.disconnect).toHaveBeenCalled();
  });
  it("validates persisted and undo selection without inventing focus", () => {
    expect(readStockSelection({ checked: ["a", "a"], active: "a", anchor: null })).toEqual({ checked: ["a"], active: "a", anchor: null });
    expect(readStockSelection({ checked: [], active: 2, anchor: null })).toBeNull(); expect(readStockSelection({ checked: [], active: null, anchor: {} })).toBeNull();
  });
});

import { NativeClient } from "../src/lib/stockupload/native";
it("times out and closes without reconnecting or silently repeating a request", async () => {
  vi.useFakeTimers();
  const port = { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } };
  const client = new NativeClient(port);
  try {
    const result = expect(client.call("begin")).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(30_001); await result;
    expect(port.postMessage).toHaveBeenCalledTimes(1); expect(port.disconnect).toHaveBeenCalledTimes(1);
  } finally { client.close(); vi.useRealTimers(); }
});
