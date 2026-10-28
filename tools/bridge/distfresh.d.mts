export function isDistStale(distHtmlPath: string, watchPaths: readonly string[]): boolean;
export function rebuildDistAsync(repoRoot: string): Promise<{ ok: boolean; reason?: string }>;
