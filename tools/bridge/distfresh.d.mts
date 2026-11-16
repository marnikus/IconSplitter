/** The app's own inputs, repository-relative: what `npm run build` reads. */
export const APP_WATCH: readonly string[];

/** `APP_WATCH` resolved under a checkout — the one list every staleness check uses. */
export function appWatchPaths(repoRoot: string): string[];

export function computeSrcFingerprint(watchPaths: readonly string[]): string;
export function isDistStale(distHtmlPath: string, watchPaths: readonly string[]): boolean;
export function servedBundle(distHtmlPath: string): { stamp: string | null; builtAt: string } | null;

/** One single-flight build; a command line and its cwd may be given instead of npm. */
export function rebuildDistAsync(
  repoRoot: string,
  build?: { cmd?: string; cwd?: string },
): Promise<{ ok: boolean; reason?: string }>;
