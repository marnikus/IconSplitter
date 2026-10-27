import { validManifest } from "../../src/lib/stockupload/protocol";
import type { TransferFile, TransferManifest, TransferReceipt } from "../../src/lib/stockupload/types";
import { StagedFile } from "./staging";
export interface StockTransport {
  upload(path: string, file: TransferFile): Promise<{ state: TransferReceipt["state"]; detail?: string }>;
  close(): void;
}
export class NativeJob {
  private manifest: TransferManifest | null = null;
  private current: StagedFile | null = null;
  private cancelled = false;
  readonly receipts: TransferReceipt[] = [];
  constructor(private transport: StockTransport, private record: (receipt: TransferReceipt) => Promise<void> = async () => undefined) {}
  async begin(raw: unknown): Promise<void> {
    if (this.cancelled || this.manifest || !validManifest(raw)) throw new Error("Invalid transfer manifest");
    this.manifest = raw;
  }
  async file(id: string): Promise<void> {
    const file = this.manifest?.files[this.receipts.length];
    if (this.cancelled || this.current || !file || file.id !== id) throw new Error("Invalid file sequence");
    this.current = await StagedFile.create(file);
  }
  async chunk(seq: number, data: string): Promise<void> {
    if (this.cancelled || !this.current) throw new Error("No active file");
    await this.current.chunk(seq, data);
  }
  async send(): Promise<TransferReceipt> {
    if (this.cancelled || !this.current) throw new Error("No active file");
    const staged = this.current;
    try {
      await staged.verify();
      await this.record({ name: staged.file.name, hash: staged.file.hash, state: "uncertain", detail: "Transfer intent recorded; reconcile after interruption" });
      const result = await this.transport.upload(staged.path, staged.file);
      const receipt = { name: staged.file.name, hash: staged.file.hash, ...result };
      await this.record(receipt); this.receipts.push(receipt); return receipt;
    } finally { await staged.dispose(); this.current = null; }
  }
  async cancel(): Promise<void> {
    this.cancelled = true; this.transport.close();
  }
  async dispose(): Promise<void> {
    await this.cancel(); await this.current?.dispose(); this.current = null;
  }
  get complete(): boolean { return this.manifest !== null && this.receipts.length === this.manifest.files.length; }
}
