import { isRecord } from "../isrecord";
import { HOST_NAME } from "./protocol";
export interface PortEvent<T> { addListener(fn: (event: T) => void): void }
export interface MessagePortLike { postMessage(value: unknown): void; disconnect(): void; onMessage: PortEvent<unknown>; onDisconnect: PortEvent<unknown> }
export interface BrowserRuntime {
  id: string;
  getURL(path: string): string;
  connect(options: { name: string }): MessagePortLike;
}
export function extensionRuntime(): BrowserRuntime | null {
  const runtime = (globalThis as unknown as { chrome?: { runtime?: BrowserRuntime } }).chrome?.runtime;
  return runtime && location.origin === `chrome-extension://${runtime.id}` ? runtime : null;
}
export class NativeClient {
  private serial = 0;
  private nonce = "";
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private port: MessagePortLike, private progress: (bytes: number) => void = () => undefined) {
    port.onMessage.addListener(raw => this.receive(raw));
    port.onDisconnect.addListener(() => this.rejectAll());
  }
  private receive(raw: unknown): void {
    if (!isRecord(raw)) return;
    if (raw.event === "progress" && typeof raw.bytes === "number") { this.progress(raw.bytes); return; }
    const pending = this.pending.get(Number(raw.id));
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(Number(raw.id));
    if (raw.ok === true) pending.resolve(raw.result);
    else pending.reject(new Error("Companion operation failed; check installation/account or reconcile transfer history"));
  }
  async hello(): Promise<void> {
    const raw = await this.call("hello", { v: 1 });
    if (!isRecord(raw) || raw.v !== 1 || typeof raw.nonce !== "string" || !/^[a-f0-9]{64}$/.test(raw.nonce)) throw new Error("Incompatible companion");
    this.nonce = raw.nonce;
  }
  call(op: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); this.close(); reject(new Error("Companion timed out; remote outcome may be uncertain")); }, op === "send" ? 310_000 : 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.port.postMessage({ ...payload, id, op, nonce: this.nonce }); }
      catch { this.close(); }
    });
  }
  private rejectAll(): void {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("Companion disconnected; reconcile remote outcomes before retry")); }
    this.pending.clear();
  }
  close(): void { this.rejectAll(); this.port.disconnect(); }
}
export function connectCompanion(progress?: (bytes: number) => void): NativeClient {
  const runtime = extensionRuntime();
  if (!runtime) throw new Error("Install the optional extension edition and local companion; standalone HTML cannot use FTPS");
  return new NativeClient(runtime.connect({ name: HOST_NAME }), progress);
}
