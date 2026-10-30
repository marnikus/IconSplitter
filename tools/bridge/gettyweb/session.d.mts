export function safeStagedName(fileName: string): string;
/** Turns one page reading into the counts the app's progress line shows. */
export function progressOf(read: any, reloads?: number): {
  total: number; uploaded: number; failed: number; listed: number; reloads: number;
};
/** How long the page may take to list `fileCount` attached files. */
export function uploadTimeoutFor(fileCount: number, baseMs?: number): number;
export function openGettySession(options: any): Promise<any>;
export function cdpFailureReason(err: unknown, browser: { port?: number; profileDir?: string }): string;
/** What a failure may do to the browser: a visible window is never killed. */
export function failureOutcome(headed: boolean, reason: unknown): { keepOpen: boolean; reason: string };
/** Detaches from a visible window (kept) or closes a hidden one. */
export function releaseSession(session: any, headed: boolean): "kept" | "closed";
