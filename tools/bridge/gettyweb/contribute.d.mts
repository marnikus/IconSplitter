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
  /** How long the page may stay silent before it is reloaded and retried. */
  stallMs?: number;
  onReload?: (reloads: number) => void;
  paths: string[];
  names: string[];
  timeoutMs?: number;
  readyTimeoutMs?: number;
  /** Poll cadence of the page waits (1 s against Getty); a test may hand in 1 ms. */
  pollMs?: number;
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; code?: string; reason?: string | null; state: any }>;
/** Getty's own Date Created rendering, e.g. "10/10/2026 00:00:00 +0000". */
export function gettyCreatedDate(now?: Date): string;
export function contributionCount(names: string[]): number;
export function listedContributions(expected: string[], state: any): number;
/** How many of the run's contributions Getty itself marked "Upload failed". */
export function failedContributions(expected: string[], state: any): number;
/** Contributions that do not carry Getty's "Ready to submit" icon yet. */
export function notReadyContributions(expected: string[], state: any): string[];
/**
 * Waits for Getty's "Ready to submit" icon on every card, pressing the grid-wide
 * Save metadata again (`readyRetryMs`, up to `readyResaves` times) when a card
 * stays unvalidated. `verified:false` means the page could not report readiness.
 */
export function finishBatch(connection: any, sessionId: string, options?: {
  expected?: string[];
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
  /** How long to wait for Getty to enable Complete before refusing. */
  completeTimeoutMs?: number;
  /** Poll cadence of the page waits (1 s against Getty); a test may hand in 1 ms. */
  pollMs?: number;
  /** Pause after clicking Complete, before the confirmation dialog is read. */
  settleMs?: number;
  /** Wait between re-applying Save metadata for a card Getty has not validated. */
  readyRetryMs?: number;
  /** How long the readiness wait may run before the file is reported. */
  readyTimeoutMs?: number;
  /** How many times Save metadata may be pressed again (default 2). */
  readyResaves?: number;
}): Promise<any>;
export function finalizeBatch(connection: any, sessionId: string, options: {
  files: Array<{
    name: string;
    metadata: { title: string; description: string; keywords: string[]; dateCreated?: string } | null;
  }>;
  /** Names Getty itself marked "Upload failed": the batch is then not submitted. */
  failed?: string[];
  complete?: boolean;
  /** How long one clicked card's drawer may stay disabled before it is reported. */
  editorTimeoutMs?: number;
  editorPollMs?: number;
  /** Poll cadence of the page waits (1 s against Getty); a test may hand in 1 ms. */
  pollMs?: number;
  /** Pause after clicking Complete, before the confirmation dialog is read. */
  settleMs?: number;
  /** Pause after the grid-wide Save metadata; Getty needs a beat to persist it. */
  bulkSaveSettleMs?: number;
  /** Wait between re-applying Save metadata for a card Getty has not validated. */
  readyRetryMs?: number;
  /** How long the readiness wait may run before the file is reported. */
  readyTimeoutMs?: number;
  /** How many times Save metadata may be pressed again (default 2). */
  readyResaves?: number;
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
}): Promise<any>;
