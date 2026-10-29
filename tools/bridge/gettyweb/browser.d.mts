export const BROWSER_FIX: string;
export function findBrowser(env?: Record<string, string | undefined>): { found: boolean; path: string | null; fix?: string };
export function parseCdpEndpoint(raw: string): URL | null;
export function launchBrowser(options?: { headed?: boolean; env?: Record<string, string | undefined>; timeoutMs?: number }): Promise<any>;
export function connectBrowser(options?: { headed?: boolean; cdpUrl?: string; env?: Record<string, string | undefined> }): Promise<any>;
