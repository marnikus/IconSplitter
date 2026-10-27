import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
/** Exclusive across browsers. An abnormal kill needs explicit reconciliation, never automatic replay. */
export async function acquireLock(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "active.lock");
  const file = await open(path, "wx", 0o600);
  await file.writeFile(String(process.pid)); await file.sync(); await file.close();
  return async () => { await unlink(path); };
}
