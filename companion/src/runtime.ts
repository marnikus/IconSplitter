import { decodeFrames, encodeFrame } from "./framing";
import type { HostSession } from "./session";
import { isRecord } from "../../src/lib/isrecord";
/** No stdout logs: the browser owns this length-prefixed binary channel. */
export function runHost(session: HostSession): void { new NativeRuntime(session); }
class NativeRuntime {
  private rest: Buffer = Buffer.alloc(0);
  private pending: Promise<void> = Promise.resolve();
  private closing = false;
  private busy = 0;
  private queued = 0;
  private lastInput = Date.now();
  private deadline: ReturnType<typeof setTimeout>;
  private idle: ReturnType<typeof setInterval>;
  constructor(private session: HostSession) {
    this.deadline = setTimeout(() => { void this.stop(); }, 5 * 60_000);
    this.idle = setInterval(() => { if (this.busy === 0 && Date.now() - this.lastInput > 90_000) void this.stop(); }, 10_000);
    process.stdin.on("data", (chunk: Buffer) => this.receive(chunk));
    process.stdin.on("end", () => { void this.stop(); });
    process.stdin.on("error", () => { void this.stop(); });
    process.stdout.on("error", () => { void this.stop(); });
    process.on("SIGTERM", () => { void this.stop(); });
  }
  private receive(chunk: Buffer): void {
    try {
      this.lastInput = Date.now(); const decoded = decodeFrames(Buffer.concat([this.rest, chunk])); this.rest = decoded.rest;
      for (const message of decoded.messages) this.dispatch(message);
    } catch { void this.stop(); }
  }
  private dispatch(raw: unknown): void {
    if (this.closing) return;
    if (isRecord(raw) && raw.op === "cancel") { void this.respond(raw); return; }
    if (this.queued > 0) { void this.stop(); return; }
    this.queued++;
    this.pending = this.pending.then(() => this.respond(raw)).finally(() => { this.queued--; });
  }
  private async respond(raw: unknown): Promise<void> {
    if (this.closing) return;
    const id = isRecord(raw) ? raw.id : null;
    try {
      this.busy++; const reply = await this.session.request(raw);
      await this.write({ id, ok: true, result: reply.result });
      if (reply.exit) await this.stop(isRecord(raw) && raw.op === "cancel");
    } catch {
      await this.write({ id, ok: false, error: "Companion refused operation; check account, exported files, active task or reconcile transfer history" }).catch(() => undefined);
      await this.stop(false);
    } finally { this.busy--; }
  }
  private write(value: unknown): Promise<void> {
    return new Promise((resolve, reject) => process.stdout.write(encodeFrame(value), e => e ? reject(e) : resolve()));
  }
  private async stop(drain = true): Promise<void> {
    if (this.closing) return; this.closing = true;
    clearTimeout(this.deadline); clearInterval(this.idle);
    const forced = setTimeout(() => process.exit(1), 3000);
    await this.session.cancel(); if (drain) await this.pending;
    await this.session.dispose().catch(() => undefined);
    clearTimeout(forced); process.exit(0);
  }
}
