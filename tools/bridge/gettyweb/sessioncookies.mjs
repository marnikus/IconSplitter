// sessioncookies.mjs — makes Getty's sign-in survive a browser restart.
//
// Chrome writes its cookie store on a real exit only, and a window that is
// killed, reset or relaunched comes back logged out — which is why a run asked
// for the contributor credentials again even with a named profile. The helper
// therefore snapshots the browser's cookies into that profile folder after a
// successful sign-in and puts them back before the first navigation.
//
// The file lives beside Chrome's own cookie store, is written mode 0600, and its
// values are never logged: callers only ever see counts.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SESSION_COOKIE_FILE = "iconsplitter-session.json";
// A contributor session needs a handful of cookies; anything huge is not ours.
const MAX_COOKIES = 400;

/** Absolute path of the cookie snapshot for a profile folder, or null. */
export function sessionCookiePath(profileDir) {
  const value = typeof profileDir === "string" ? profileDir.trim() : "";
  return value === "" ? null : path.join(path.resolve(value), SESSION_COOKIE_FILE);
}

/** The fields `Storage.setCookies` accepts, dropping anything unusable. */
function usableCookies(cookies) {
  if (!Array.isArray(cookies)) return [];
  return cookies
    .filter((cookie) => cookie && typeof cookie.name === "string" && cookie.name !== ""
      && typeof cookie.value === "string" && typeof cookie.domain === "string" && cookie.domain !== "")
    .slice(0, MAX_COOKIES)
    .map((cookie) => ({
      name: cookie.name, value: cookie.value, domain: cookie.domain,
      path: typeof cookie.path === "string" && cookie.path !== "" ? cookie.path : "/",
      expires: typeof cookie.expires === "number" ? cookie.expires : -1,
      httpOnly: cookie.httpOnly === true, secure: cookie.secure === true,
      ...(typeof cookie.sameSite === "string" ? { sameSite: cookie.sameSite } : {}),
    }));
}

/**
 * Writes the browser's current cookies into the profile folder so the next
 * launch starts signed in. Returns how many were kept — never a value.
 */
export async function saveSessionCookies(connection, profileDir) {
  const file = sessionCookiePath(profileDir);
  if (file === null) return { saved: 0, file: null };
  try {
    const result = await connection.send("Storage.getCookies", {});
    const cookies = usableCookies(result?.cookies);
    if (cookies.length === 0) return { saved: 0, file };
    writeFileSync(file, JSON.stringify({ cookies }), { mode: 0o600 });
    return { saved: cookies.length, file };
  } catch {
    return { saved: 0, file };
  }
}

/**
 * Puts the snapshot back into the browser before the contributor page loads.
 * Returns how many cookies were restored, or 0 when there is nothing to do.
 */
export async function restoreSessionCookies(connection, profileDir) {
  const file = sessionCookiePath(profileDir);
  if (file === null) return { restored: 0, file: null };
  const cookies = readSnapshot(file);
  if (cookies.length === 0) return { restored: 0, file };
  try {
    // Never overwrite a cookie the live browser already has — that one is newer.
    const live = await connection.send("Storage.getCookies", {}).catch(() => ({}));
    const have = new Set(usableCookies(live?.cookies).map((cookie) => `${cookie.domain}|${cookie.name}`));
    const missing = cookies.filter((cookie) => !have.has(`${cookie.domain}|${cookie.name}`));
    if (missing.length === 0) return { restored: 0, file };
    await connection.send("Storage.setCookies", { cookies: missing });
    return { restored: missing.length, file };
  } catch {
    return { restored: 0, file };
  }
}

function readSnapshot(file) {
  try {
    return usableCookies(JSON.parse(readFileSync(file, "utf8"))?.cookies);
  } catch {
    return [];
  }
}
