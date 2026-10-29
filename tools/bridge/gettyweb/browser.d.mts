export const BROWSER_FIX: string;
export function findBrowser(env?: Record<string, string | undefined>): { found: boolean; path: string | null; fix?: string };
export function parseCdpEndpoint(raw: string): URL | null;
export function resolveProfileDir(raw: string | undefined): string | null;
export function profileLocks(dir: string): string[];
export function decideProfileUse(input: { locked: boolean; answers: boolean }): "attach" | "launch" | "busy";
export function profileProcessIds(listing: string, dir: string): number[];
export function resetProfile(dir: string, options?: {
  listProcesses?: () => Promise<string>;
  killPids?: (pids: number[]) => void;
  settleMs?: number;
}): Promise<{ reset: boolean; killed: number[]; reason: string | null }>;
export function launchBrowser(options?: {
  headed?: boolean;
  profileDir?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  spawnFn?: (path: string, args: string[], options: { stdio: "ignore" }) => { exitCode: number | null; pid?: number; kill?: () => unknown };
  probeSocket?: (port: number) => Promise<string | null>;
  resetProfile?: boolean;
  listProcesses?: () => Promise<string>;
  killPids?: (pids: number[]) => void;
  settleMs?: number;
}): Promise<any>;
export function connectBrowser(options?: { headed?: boolean; cdpUrl?: string; profileDir?: string; env?: Record<string, string | undefined> }): Promise<any>;
