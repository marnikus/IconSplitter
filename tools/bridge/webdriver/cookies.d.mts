/** File name of the cookie snapshot kept inside the profile folder. */
export const SESSION_COOKIE_FILE: string;
/** Absolute path of the snapshot for a profile folder, or null when unnamed. */
export function sessionCookiePath(profileDir?: string | null): string | null;
/** Writes the browser's cookies into the profile folder; counts only, never values. */
export function saveSessionCookies(connection: any, profileDir?: string | null): Promise<{ saved: number; file: string | null }>;
/** Puts back the cookies the live browser is missing, before the first navigation. */
export function restoreSessionCookies(connection: any, profileDir?: string | null): Promise<{ restored: number; file: string | null }>;
