// helperurl.ts — where the ONE local helper (tools/bridge/server.mjs) listens,
// and what to tell the user when it does not answer. Feature-neutral: the
// Inkscape conversion, the FTPS/Getty uploads and the ChatGPT web generation
// all talk to the same loopback process, so none of them owns its address.

export const HELPER_PORT = 47391;
export const DEFAULT_HELPER_URL = `http://127.0.0.1:${HELPER_PORT}`;
export const HELPER_FIX_HINT = "start run_ftp_bridge.bat (or run_inkscape_bridge.bat) on this machine";

/** A configured helper URL without trailing slashes; the default when blank. */
export function helperBase(url: string | undefined): string {
  return (url ?? DEFAULT_HELPER_URL).trim().replace(/\/+$/, "") || DEFAULT_HELPER_URL;
}
