import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dataDirectory } from "./storage";
type Browser = "chrome" | "edge";
function registration(browser: Browser): string {
  if (process.platform === "win32") return `HKCU\\Software\\${browser === "chrome" ? "Google\\Chrome" : "Microsoft\\Edge"}\\NativeMessagingHosts\\com.iconsplitter.stock`;
  const base = process.platform === "darwin" ? (browser === "chrome" ? "Library/Application Support/Google/Chrome" : "Library/Application Support/Microsoft Edge") : (browser === "chrome" ? ".config/google-chrome" : ".config/microsoft-edge");
  return join(homedir(), base, "NativeMessagingHosts", "com.iconsplitter.stock.json");
}
export async function installNative(extensionId: string, browser: string): Promise<void> {
  if (!/^[a-p]{32}$/.test(extensionId) || !["chrome", "edge"].includes(browser)) throw new Error("Usage: iconsplitter-stock --install EXACT_EXTENSION_ID chrome|edge");
  const dir = dataDirectory(); await mkdir(dir, { recursive: true, mode: 0o700 });
  const config = join(dir, "installation.json"), ids = await installedIds();
  const extensionIds = [...new Set([...ids, extensionId])];
  await writeFile(config, JSON.stringify({ extensionIds }), { mode: 0o600 });
  const manifest = { name: "com.iconsplitter.stock", description: "IconSplitter on-demand FTPS companion", path: process.execPath, type: "stdio", allowed_origins: extensionIds.map(id => `chrome-extension://${id}/`) };
  const path = join(dir, "com.iconsplitter.stock.json"); await writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  if (process.platform === "win32") execFileSync("reg.exe", ["ADD", registration(browser as Browser), "/ve", "/t", "REG_SZ", "/d", path, "/f"], { stdio: "inherit" });
  else { const target = registration(browser as Browser); await mkdir(join(target, ".."), { recursive: true }); await copyFile(path, target); }
}
export async function installedIds(): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(join(dataDirectory(), "installation.json"), "utf8")) as { extensionIds: unknown };
    if (!Array.isArray(raw.extensionIds) || !raw.extensionIds.every(id => typeof id === "string" && /^[a-p]{32}$/.test(id))) throw new Error("Invalid installation identity");
    return raw.extensionIds;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function uninstallNative(browser: string): Promise<void> {
  if (!["chrome", "edge"].includes(browser)) throw new Error("Usage: iconsplitter-stock --uninstall chrome|edge");
  if (process.platform === "win32") execFileSync("reg.exe", ["DELETE", registration(browser as Browser), "/f"], { stdio: "inherit" });
  else await unlink(registration(browser as Browser));
}
