// buildstamp.ts — which build is this page running (2026-11-08).
//
// The helper serves the built `dist/` and rebuilds it on its own, so a tab that
// was opened earlier can run older code while the user believes it is testing
// the fix. vite.config.ts stamps every built page with the source fingerprint;
// this reads it back so the log dock can show it and a bug report can say which
// build it came from. "dev" means no stamp: a vitest run or a hot dev server.

const META = 'meta[name="iconsplitter-src-hash"]';

/** The build stamp of the document, shortened to eight characters. */
export function readBuildStamp(doc: Document = document): string {
  const content = doc.querySelector(META)?.getAttribute("content")?.trim() ?? "";
  return content.length > 0 ? content.slice(0, 8) : "dev";
}

let cached: string | null = null;

/** The stamp, read once per page (the meta never changes while it is open). */
export function buildStamp(): string {
  cached ??= readBuildStamp();
  return cached;
}
