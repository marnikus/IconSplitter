/** Every name a feature's browser uses; nothing is shared between features. */
export interface BrowserNaming {
  readonly browserEnv: string;
  readonly cdpEnv: string;
  readonly tempPrefix: string;
  readonly retry: string;
}
type Env = Record<string, string | undefined>;
export function browserFix(naming: BrowserNaming): string;
export function findBrowser(env: Env, naming: BrowserNaming): { found: boolean; path: string | null; fix?: string };
export function cdpEndpointOf(options: { naming: BrowserNaming; cdpUrl?: string; env?: Env }): URL | null;
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
/** Cancels the idle close of a profile the next run is about to reuse. */
export function cancelIdleClose(dir: string): boolean;
export interface LaunchOptions {
  naming: BrowserNaming;
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
  /** Asks the browser to exit over DevTools, so cookies are flushed first. */
  gracefulClose?: (socket: string) => Promise<boolean>;
  /** How long a polite close may take before the process is force-ended. */
  closeTimeoutMs?: number;
  /** How long a named profile's browser is kept between runs. */
  idleMs?: number;
}
export function launchBrowser(options: LaunchOptions): Promise<any>;
export function connectBrowser(options: LaunchOptions & { cdpUrl?: string }): Promise<any>;
