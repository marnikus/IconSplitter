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
/** The "Upload failed" cards of this request only, never an earlier part's. */
export function ownFailures(failures: any, files: any): { name: string; id: string | null }[];
/** The per-batch state a new batch starts from. */
export function resetBatchState(state: any): any;
