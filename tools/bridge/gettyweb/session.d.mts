export function safeStagedName(fileName: string): string;
/** Turns one page reading into the counts the app's progress line shows. */
export function progressOf(read: any, reloads?: number): {
  total: number; uploaded: number; failed: number; listed: number; ready?: number; reloads: number;
};
/**
 * What the run may call uploaded: the last reading (after the metadata save),
 * where a file counts only if its card carries Getty's "Ready to submit" icon.
 */
export function acceptedOf(done: any, attachResult: any): string[];
/** The contributions Getty never validated, by stem. */
export function notReadyOf(done: any): string[];
/** The staged copies to re-upload for the named contributions (matched by stem). */
export function repairTargets(files: any, paths: any, names: any): Array<{ name: string; path: string }>;
/** The repair the readiness gate may call; undefined when nothing was staged. */
export function repairCapability(
  connection: any, sessionId: string, files: any, paths: any, options?: any,
): ((names: string[]) => Promise<{ ok: boolean }>) | undefined;
/** How long the page may take to list `fileCount` attached files. */
export function uploadTimeoutFor(fileCount: number, baseMs?: number): number;
export function openGettySession(options: any): Promise<any>;
export function cdpFailureReason(err: unknown, browser: { port?: number; profileDir?: string }): string;
/** What a failure may do to the browser: a visible window is never killed. */
export function failureOutcome(headed: boolean, reason: unknown): { keepOpen: boolean; reason: string };
/** Detaches from a visible window (kept) or closes a hidden one. */
export function releaseSession(session: any, headed: boolean): "kept" | "closed";
