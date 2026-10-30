export function computeSrcFingerprint(watchPaths: readonly string[]): string;
export function isDistStale(distHtmlPath: string, watchPaths: readonly string[]): boolean;
export function rebuildDistAsync(repoRoot: string): Promise<{ ok: boolean; reason?: string }>;
