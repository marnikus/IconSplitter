// tools/tsimport.mjs — a Node resolve hook so a plain `node tools/*.mjs` script
// can import the app's TypeScript source.
//
// Node ≥ 22.18 strips types by itself, but it resolves ESM specifiers literally:
// the repo's source imports `./mergeseries` (no extension) because vite/vitest
// resolve it, so Node needs one nudge. This hook retries only relative,
// extensionless specifiers with `.ts` — nothing else changes, and no dependency
// is involved (vitest's own resolver is not used by tools scripts).

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) return nextResolve(specifier, context);
  return nextResolve(specifier, context).catch(() => nextResolve(`${specifier}.ts`, context));
}
