import { runHost } from "./runtime";
import { HostSession } from "./session";
import { FtpsTransport } from "./ftp";
import { encodeFrame } from "./framing";
import { installedIds, installNative, uninstallNative } from "./install";
async function main(): Promise<void> {
  if (process.argv[2] === "--install") {
    await installNative(process.argv[3], process.argv[4]); console.log("Per-user host installed. No process is left running. Keep this package at its current path."); return;
  }
  if (process.argv[2] === "--uninstall") { await uninstallNative(process.argv[3]); console.log("Registration removed. Credentials and receipts preserved; forget credentials in the app before uninstalling."); return; }
  const ids = await installedIds();
  if (!ids.some(id => process.argv[2] === `chrome-extension://${id}/`)) throw new Error("Untrusted native caller");
  const ftp = new FtpsTransport(async () => (await import("./vault")).readCredentials(), bytes => process.stdout.write(encodeFrame({ event: "progress", bytes })));
  runHost(new HostSession(ftp, { save: async raw => (await import("./vault")).saveCredentials(raw), forget: async () => (await import("./vault")).forgetCredentials() }));
}
void main().catch(error => {
  if (["--install", "--uninstall"].includes(process.argv[2])) console.error(error instanceof Error ? error.message : "Native registration failed");
  process.exit(1);
});
