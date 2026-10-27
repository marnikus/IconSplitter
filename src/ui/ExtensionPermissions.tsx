import { useState } from "react";
import { extensionRuntime } from "../lib/stockupload/native";
interface PermissionsApi { request(options: { origins: string[] }): Promise<boolean> }
/** Extension edition's optional HTTPS permission is always an explicit, origin-specific browser prompt. */
export default function ExtensionPermissions() {
  const [status, setStatus] = useState("");
  if (!extensionRuntime()) return null;
  async function grant(): Promise<void> {
    const text = window.prompt("Configured AI provider HTTPS origin (no key or URL parameters)", "https://generativelanguage.googleapis.com");
    if (!text) return;
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use only an HTTPS origin");
      const api = (globalThis as unknown as { chrome: { permissions: PermissionsApi } }).chrome.permissions;
      setStatus(await api.request({ origins: [`${url.origin}/*`] }) ? `Access allowed for ${url.origin}` : "Permission declined");
    } catch { setStatus("Enter only the configured provider's HTTPS origin, with no key, path, query or password"); }
  }
  return <details className="px-4 text-xs"><summary>Extension storage & provider permissions</summary>
    <p>This edition has separate browser storage. Reselect folders and re-enter provider keys here; no silent credential migration. Stock account credentials stay in the OS keyring.</p>
    <button onClick={() => void grant()}>Allow configured HTTPS provider</button><span role="status">{status}</span>
  </details>;
}
