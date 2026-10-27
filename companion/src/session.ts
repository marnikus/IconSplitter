import { createHash, randomBytes } from "node:crypto";
import { isRecord } from "../../src/lib/isrecord";
import { validManifest } from "../../src/lib/stockupload/protocol";
import { NativeJob, type StockTransport } from "./job";
import { ReceiptJournal } from "./storage";
import { acquireLock } from "./lock";
import type { StockCredentials } from "./vault";
export interface AccountStore { save(raw: StockCredentials): Promise<void>; forget(): Promise<void> }
export class HostSession {
  private nonce = randomBytes(32).toString("hex");
  private greeted = false;
  private serial = 0;
  private job: NativeJob;
  private running = false;
  private terminal = false;
  private lock: (() => Promise<void>) | null = null;
  constructor(transport: StockTransport, private accounts: AccountStore, private journal = new ReceiptJournal()) {
    this.job = new NativeJob(transport, r => this.journal.write(r));
  }
  async request(value: unknown): Promise<{ result: unknown; exit?: boolean }> {
    const raw = this.envelope(value);
    if (raw.op === "hello") return this.hello(raw.v);
    if (!this.greeted || raw.nonce !== this.nonce) throw new Error("Invalid session");
    if (raw.op === "cancel") { await this.job.cancel(); return { result: { cancelled: true }, exit: true }; }
    if (!this.lock) this.lock = await acquireLock(this.journal.directory);
    if (this.terminal) return this.acknowledge(raw.op);
    if (raw.op === "finish") return this.finish();
    return { result: await this.operation(raw) };
  }
  private envelope(raw: unknown): Record<string, unknown> {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.id) || Number(raw.id) <= this.serial) throw new Error("Invalid request sequence");
    this.serial = Number(raw.id); return raw;
  }
  private hello(version: unknown): { result: unknown } {
    if (version !== 1 || this.greeted) throw new Error("Incompatible or repeated handshake");
    this.greeted = true; return { result: { v: 1, nonce: this.nonce } };
  }
  private acknowledge(op: unknown): { result: unknown; exit: boolean } {
    if (op !== "ack") throw new Error("Terminal session");
    return { result: { acknowledged: true }, exit: true };
  }
  private async operation(raw: Record<string, unknown>): Promise<unknown> {
    if (this.running) return await this.transferOperation(raw);
    if (raw.op === "begin") return await this.begin(raw.manifest);
    const result = await this.accountOperation(raw); this.terminal = true; return result;
  }
  private async accountOperation(raw: Record<string, unknown>): Promise<unknown> {
    switch (raw.op) {
      case "save":
        if (typeof raw.username !== "string" || typeof raw.password !== "string") throw new Error("Invalid account fields");
        await this.accounts.save({ username: raw.username, password: raw.password }); return { saved: true };
      case "forget": await this.accounts.forget(); return { forgotten: true };
      case "receipts": return await this.journal.read();
      case "reconcile": await this.journal.replace([]); return { reconciled: true };
      default: throw new Error("Unsupported account operation");
    }
  }
  private async transferOperation(raw: Record<string, unknown>): Promise<unknown> {
    switch (raw.op) {
      case "file": await this.job.file(String(raw.file)); return { ready: true };
      case "chunk": await this.job.chunk(Number(raw.seq), String(raw.data)); return { seq: raw.seq };
      case "send": return await this.job.send();
      default: throw new Error("Unsupported transfer operation");
    }
  }
  private async begin(manifest: unknown): Promise<unknown> {
    if (!validManifest(manifest)) throw new Error("Invalid manifest");
    await this.journal.assertFresh(manifest); await this.job.begin(manifest); this.running = true;
    return { digest: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") };
  }
  private finish(): { result: unknown } {
    if (!this.job.complete) throw new Error("Incomplete batch");
    this.terminal = true; return { result: { receipts: this.job.receipts } };
  }
  async cancel(): Promise<void> { await this.job.cancel(); }
  async dispose(): Promise<void> { await this.job.dispose(); await this.lock?.(); this.lock = null; }
}
