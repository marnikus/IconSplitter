// The bridge's DevTools-protocol client, driven by a stand-in socket. This
// proves request/response bookkeeping, event routing, page-step serialization
// and file attachment without needing Chrome on the test machine.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluate, openCdp, runStep, setFiles, stepExpression, waitFor,
} from "../tools/bridge/gettyweb/cdp.mjs";

type Listener = (event: { data?: string }) => void;

class FakeSocket {
  static instances: FakeSocket[] = [];
  static open(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }
  listeners = new Map<string, Listener[]>();
  sent: Array<{ id: number; method: string; params: Record<string, unknown>; sessionId?: string }> = [];
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, event: { data?: string } = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }
  close(): void {
    this.emit("close");
  }
  reply(id: number, result: unknown): void {
    this.emit("message", { data: JSON.stringify({ id, result }) });
  }
  replyWithError(id: number, message: string): void {
    this.emit("message", { data: JSON.stringify({ id, error: { message } }) });
  }
}

function connect(): { connection: ReturnType<typeof openCdp>; socket: FakeSocket } {
  const connection = openCdp("ws://127.0.0.1:9222/devtools/browser/x", { WebSocketImpl: FakeSocket as never });
  const socket = FakeSocket.open();
  socket.emit("open");
  return { connection, socket };
}

beforeEach(() => {
  FakeSocket.instances = [];
});

describe("DevTools protocol client", () => {
  it("resolves a request by id and carries the session for a page call", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const answer = connection.send("Page.navigate", { url: "https://esp.gettyimages.com/contribute" }, "session-1");
    const request = socket.sent[0];
    expect(request).toMatchObject({ id: 1, method: "Page.navigate", sessionId: "session-1" });
    socket.reply(1, { frameId: "f" });
    await expect(answer).resolves.toEqual({ frameId: "f" });
  });

  it("rejects protocol errors with the browser's message", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const answer = connection.send("DOM.querySelector", {});
    socket.replyWithError(1, "No node with given id found");
    await expect(answer).rejects.toThrow("No node with given id found");
  });

  it("routes events to on() handlers", async () => {
    const { connection, socket } = connect();
    const seen = vi.fn();
    connection.on("Page.loadEventFired", seen);
    socket.emit("message", { data: JSON.stringify({ method: "Page.loadEventFired", params: { timestamp: 7 } }) });
    expect(seen).toHaveBeenCalledWith({ timestamp: 7 }, undefined);
  });

  it("returns a by-value page result and surfaces an in-page exception", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const value = evaluate(connection, "1 + 1", "s1");
    socket.reply(1, { result: { value: 2 } });
    await expect(value).resolves.toBe(2);

    const broken = evaluate(connection, "throw new Error('boom')", "s1");
    socket.reply(2, { exceptionDetails: { text: "Uncaught", exception: { description: "Error: boom\n    at page" } } });
    await expect(broken).rejects.toThrow(/^Error: boom$/);
  });

  it("serializes a page step as prelude + self-contained function + JSON argument", () => {
    const expression = stepExpression("function helper() { return 1; }", "function step(arg) { return arg.n; }", { n: 5 });
    expect(expression).toContain("function helper()");
    expect(expression).toContain(";(function step(arg) { return arg.n; })({\"n\":5})");
    expect(() => new Function(`return ${expression}`)).not.toThrow();
  });

  it("runs a named driver step with its argument through Runtime.evaluate", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const pending = runStep(connection, "function firstVisible() {}", "function readUploadState(arg) { return arg; }", { names: ["a.jpg"] }, "s1");
    const request = socket.sent[0];
    expect(request.method).toBe("Runtime.evaluate");
    expect(String(request.params.expression)).toContain("function firstVisible()");
    expect(String(request.params.expression)).toContain('{"names":["a.jpg"]}');
    socket.reply(1, { result: { value: { namesSeen: ["a.jpg"] } } });
    await expect(pending).resolves.toEqual({ namesSeen: ["a.jpg"] });
  });

  it("polls until the expression is truthy", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const waiting = waitFor(connection, "Boolean(window.ready)", { sessionId: "s1", timeoutMs: 3000, intervalMs: 1 });
    socket.reply(1, { result: { value: false } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    socket.reply(2, { result: { value: true } });
    await expect(waiting).resolves.toEqual({ ok: true, value: true });
  });

  it("attaches files by object id and reports a missing input honestly", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const attached = setFiles(connection, ["/tmp/a/icon_a.jpeg"], { sessionId: "s1" });
    socket.reply(1, { result: { objectId: "obj-1" } });
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(socket.sent[1]).toMatchObject({ method: "DOM.setFileInputFiles", params: { files: ["/tmp/a/icon_a.jpeg"], objectId: "obj-1" } });
    socket.reply(2, {});
    await expect(attached).resolves.toEqual({ ok: true, reason: null });

    const missing = setFiles(connection, ["/tmp/a/icon_a.jpeg"], { sessionId: "s1" });
    socket.reply(3, { result: {} });
    await expect(missing).resolves.toEqual({ ok: false, reason: "the upload page has no file input" });
  });

  it("fails pending requests once the socket closes", async () => {
    const { connection, socket } = connect();
    await connection.ready;
    const pending = connection.send("Runtime.evaluate", {});
    socket.close();
    await expect(pending).rejects.toThrow("browser debugging socket closed");
    await expect(connection.send("Runtime.evaluate", {})).rejects.toThrow("browser debugging socket closed");
  });
});
