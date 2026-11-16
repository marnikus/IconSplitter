export function findFolder(body: unknown, deps?: { platform?: string; budgetMs?: number; starts?: string[] }): { ok: true; path: string } | { ok: false; reason: string };
