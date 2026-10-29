export function runDriverStep(connection: any, sessionId: string, name: string, arg?: unknown): Promise<any>;
export function openContributePage(connection: any, sessionId: string, url: string): Promise<any>;
export function ensureSignedIn(connection: any, sessionId: string, options: {
  creds: { username: string; password: string };
  url?: string;
  timeoutMs?: number;
  pollMs?: number;
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
}): Promise<any>;
export function signInFailure(
  info: any,
  submitted: boolean,
  diagnostic?: any,
): { ok: false; code: "auth" | "timeout"; reason: string };
export function describeSignInPage(diagnostic: any): string;
export function createBatch(connection: any, sessionId: string, options: any): Promise<any>;
export function attachFiles(connection: any, sessionId: string, options: {
  paths: string[];
  names: string[];
  timeoutMs?: number;
  readyTimeoutMs?: number;
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; code?: string; reason?: string | null; state: any }>;
export function todayIso(now?: Date): string;
export function contributionCount(names: string[]): number;
export function listedContributions(expected: string[], state: any): number;
/** How many of the run's contributions Getty itself marked "Upload failed". */
export function failedContributions(expected: string[], state: any): number;
export function finishBatch(connection: any, sessionId: string, options?: {
  expected?: string[];
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
  /** How long to wait for Getty to enable Complete before refusing. */
  completeTimeoutMs?: number;
}): Promise<any>;
export function finalizeBatch(connection: any, sessionId: string, options: {
  files: Array<{
    name: string;
    metadata: { title: string; description: string; keywords: string[]; dateCreated?: string } | null;
  }>;
  complete?: boolean;
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
}): Promise<any>;
