import type { BrowserNaming, LaunchOptions } from "../webdriver/browser.mjs";
export const GETTY_NAMING: BrowserNaming;
export const BROWSER_FIX: string;
export function findBrowser(env?: Record<string, string | undefined>): { found: boolean; path: string | null; fix?: string };
export function launchBrowser(options?: Omit<LaunchOptions, "naming">): Promise<any>;
export function connectBrowser(options?: Omit<LaunchOptions, "naming"> & { cdpUrl?: string }): Promise<any>;
export {
  cancelIdleClose, decideProfileUse, parseCdpEndpoint, profileLocks, profileProcessIds, resetProfile, resolveProfileDir,
} from "../webdriver/browser.mjs";
