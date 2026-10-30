export function safeStagedName(fileName: string): string;
export interface GettyCardTruth {
  name: string; stem: string; id: string | null;
  state: "pending" | "arrived" | "ready" | "failed";
  picture: boolean; ready: boolean;
}
/** One contribution's truth from a reading, by its own card. */
export function truthOf(read: any): GettyCardTruth[];
/** Turns one page reading into the counts the app's progress line shows. */
export function progressOf(read: any, reloads?: number): {
  total: number; uploaded: number; ready: number; failed: number; listed: number;
  pending: number; verified: boolean; reloads: number;
};
/** What the run may call uploaded: only cards carrying the "Ready to submit" icon. */
export function acceptedOf(read: any): string[];
export function outcomesOf(read: any): Array<GettyCardTruth>;
/** Names still listed or arrived but never validated. */
export function pendingOf(read: any, names: string[]): string[];
/** How long the page may take to list `fileCount` attached files. */
export function uploadTimeoutFor(fileCount: number, baseMs?: number): number;
export function openGettySession(options: any): Promise<any>;
export function cdpFailureReason(err: unknown, browser: { port?: number; profileDir?: string }): string;
/** What a failure may do to the browser: a visible window is never killed. */
export function failureOutcome(headed: boolean, reason: unknown): { keepOpen: boolean; reason: string };
/** Detaches from a visible window (kept) or closes a hidden one. */
export function releaseSession(session: any, headed: boolean): "kept" | "closed";
