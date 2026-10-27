import { Client } from "basic-ftp";
import type { StockTransport } from "./job";
import type { StockCredentials } from "./vault";
import type { TransferFile, TransferReceipt } from "../../src/lib/stockupload/types";
export interface FtpOptions { host: string; port: number; secureOptions?: import("node:tls").ConnectionOptions }
const SHUTTERSTOCK = { host: "ftps.shutterstock.com", port: 21 };

/** Endpoint injection is an internal test seam, never accepted from browser messages. */
export class FtpsTransport implements StockTransport {
  private client = new Client(30_000);
  private connected = false;
  private closed = false;
  constructor(private credentials: () => Promise<StockCredentials>, private progress: (bytes: number) => void, private endpoint: FtpOptions = SHUTTERSTOCK) {}
  private async connect(): Promise<void> {
    if (this.closed) throw new Error("Cancelled");
    if (this.connected) return;
    const credentials = await this.credentials();
    await this.client.access({ ...this.endpoint, user: credentials.username, password: credentials.password, secure: true });
    this.client.trackProgress(info => this.progress(info.bytes)); this.connected = true;
  }
  async upload(path: string, file: TransferFile): Promise<{ state: TransferReceipt["state"]; detail?: string }> {
    let writing = false;
    try {
      await this.connect();
      const entries = await this.client.list();
      if (entries.some(e => e.name.toLowerCase() === file.name.toLowerCase())) return { state: "failed", detail: "Remote name already exists; not overwritten" };
      writing = true; await this.client.uploadFrom(path, file.name);
      return { state: "transferred" };
    } catch {
      this.close();
      return { state: writing ? "uncertain" : "failed", detail: "FTPS operation failed; verify account/connection or reconcile remote file before retry" };
    }
  }
  close(): void { this.closed = true; this.client.close(); }
}
