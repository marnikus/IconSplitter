import { checkStagedMedia } from "./mediacheck";
import { createHash } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHUNK_BYTES } from "../../src/lib/stockupload/protocol";
import type { TransferFile } from "../../src/lib/stockupload/types";

export class StagedFile {
  private digest = createHash("sha256");
  private size = 0;
  private seq = 0;
  private magic = Buffer.alloc(0);
  private constructor(readonly dir: string, readonly path: string, private writer: Awaited<ReturnType<typeof open>>, readonly file: TransferFile) {}
  static async create(file: TransferFile): Promise<StagedFile> {
    const dir = await mkdtemp(join(tmpdir(), "iconsplitter-stock-"));
    const path = join(dir, "payload");
    return new StagedFile(dir, path, await open(path, "wx", 0o600), file);
  }
  async chunk(sequence: number, encoded: string): Promise<void> {
    if (sequence !== this.seq || encoded.length > CHUNK_BYTES * 2 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("Invalid chunk");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > CHUNK_BYTES || this.size + bytes.length > this.file.bytes) throw new Error("Invalid chunk size");
    if (this.size === 0) this.magic = bytes.subarray(0, 16);
    await this.writer.writeFile(bytes); this.digest.update(bytes); this.size += bytes.length; this.seq++;
  }
  async verify(): Promise<void> {
    await this.writer.close();
    if (this.size !== this.file.bytes || this.digest.digest("hex") !== this.file.hash) throw new Error("File integrity mismatch");
    const valid = this.file.kind === "jpg" ? this.magic[0] === 255 && this.magic[1] === 216 : this.magic.toString("ascii").startsWith("%!PS-Adobe");
    if (!valid) throw new Error("File signature mismatch");
    await checkStagedMedia(this.path, this.file);
  }
  async dispose(): Promise<void> {
    await this.writer.close().catch(() => undefined);
    await rm(this.dir, { recursive: true, force: true });
  }
}
