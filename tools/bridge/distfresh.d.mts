export function computeSrcFingerprint(watchPaths: readonly string[]): string;
export function isDistStale(distHtmlPath: string, watchPaths: readonly string[]): boolean;
export function servedBundle(distHtmlPath: string): { stamp: string | null; builtAt: string } | null;
export function rebuildDistAsync(repoRoot: string): Promise<{ ok: boolean; reason?: string }>;
