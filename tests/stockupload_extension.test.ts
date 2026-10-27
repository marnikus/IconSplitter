// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOST_NAME } from "../src/lib/stockupload/protocol";
function event<T>() { const listeners: ((v: T) => void)[] = []; return { addListener: (fn: (v: T) => void) => listeners.push(fn), emit: (v: T) => listeners.forEach(fn => fn(v)) }; }
function port() { return { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: event<unknown>(), onDisconnect: event<unknown>() }; }
afterEach(() => vi.unstubAllGlobals());
describe("extension native bridge is exact-origin and source-channel owned", () => {
  it("rejects websites/foreign IDs, allows only owned app, forwards bounded RPC and closes with page", async () => {
    vi.resetModules(); const id = "a".repeat(32), connect = event<ReturnType<typeof port> & { name: string; sender: unknown }>(), host = port();
    const native = vi.fn(() => host), click = event<unknown>(), create = vi.fn();
    vi.stubGlobal("chrome", { runtime: { id, getURL: (p: string) => `chrome-extension://${id}/${p}`, onConnect: connect, connectNative: native }, action: { onClicked: click }, tabs: { create } });
    await import("../extension/background");
    const bad = { ...port(), name: HOST_NAME, sender: { id, url: "https://evil.example/index.html", tab: { id: 1 } } };
    connect.emit(bad); expect(bad.disconnect).toHaveBeenCalled(); expect(native).not.toHaveBeenCalled();
    const page = { ...port(), name: HOST_NAME, sender: { id, url: `chrome-extension://${id}/index.html`, tab: { id: 1 } } };
    connect.emit(page); expect(native).toHaveBeenCalledWith(HOST_NAME);
    page.onMessage.emit({ op: "hello", id: 1 }); expect(host.postMessage).toHaveBeenCalledWith({ op: "hello", id: 1 });
    const second = { ...port(), name: HOST_NAME, sender: page.sender }; connect.emit(second); expect(second.disconnect).toHaveBeenCalled();
    host.onMessage.emit({ ok: true }); expect(page.postMessage).toHaveBeenCalledWith({ ok: true });
    page.onDisconnect.emit(undefined); expect(host.disconnect).toHaveBeenCalled();
    click.emit(undefined); expect(create).toHaveBeenCalledWith({ url: `chrome-extension://${id}/index.html` });
  });
});
