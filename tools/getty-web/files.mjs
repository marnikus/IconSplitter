// Validates a flat, explicitly selected Getty stage folder; CSV is never sent.
import { readdir, lstat, mkdtemp, open, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_FILES = 200;

export async function inspectGettyBatch(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  const pairs = new Map();
  let totalBytes = 0;
  for (const entry of entries) {
    const match = /^(.*)\.(eps|jpg)$/i.exec(entry.name);
    if (!match) continue;
    if (entry.isSymbolicLink()) throw new Error("Symbolic links are not allowed in the batch.");
    if (!entry.isFile() || !match[1]) throw new Error("Batch files must be regular files with a name.");
    const ext = match[2].toLowerCase();
    const key = match[1].toLowerCase();
    const pair = pairs.get(key) ?? new Set();
    if (pair.has(ext)) throw new Error("Duplicate case-insensitive batch filename.");
    pair.add(ext);
    pairs.set(key, pair);
    const filePath = path.join(folder, entry.name);
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Batch files must not be links.");
    if (info.size === 0) throw new Error("Batch contains an empty file.");
    if (info.size > MAX_FILE_BYTES) throw new Error("Batch file exceeds 50 MiB local limit.");
    totalBytes += info.size;
    files.push({ name: entry.name, path: filePath, size: info.size, mtimeMs: info.mtimeMs });
  }
  if (!files.length || [...pairs.values()].some((p) => p.size !== 2)) {
    throw new Error("Every illustration requires an EPS and JPG pair with the same basename.");
  }
  if (files.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) throw new Error("Batch exceeds local file count or size limit.");
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, totalBytes };
}

async function copySnapshot(file, destination) {
  const source = await open(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let target;
  try {
    const before = await source.stat();
    if (!before.isFile() || before.size !== file.size || before.mtimeMs !== file.mtimeMs) {
      throw new Error("Batch file changed after validation; please restart.");
    }
    target = await open(destination, "wx", 0o600);
    const buffer = Buffer.alloc(64 * 1024);
    let position = 0;
    while (position < before.size) {
      const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, before.size - position), position);
      if (!bytesRead) throw new Error("Batch file changed while preparing it; please restart.");
      let written = 0;
      while (written < bytesRead) {
        const result = await target.write(buffer, written, bytesRead - written);
        if (!result.bytesWritten) throw new Error("Could not prepare batch file.");
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    const after = await source.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("Batch file changed while preparing it; please restart.");
  } finally {
    await source.close();
    if (target) await target.close();
  }
}

export async function snapshotGettyBatch(batch) {
  const dir = await mkdtemp(path.join(tmpdir(), "iconsplitter-getty-"));
  try {
    const files = [];
    for (const file of batch.files) {
      const destination = path.join(dir, file.name);
      await copySnapshot(file, destination);
      files.push(destination);
    }
    return { files, cleanup: () => rm(dir, { recursive: true, force: true }) };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
