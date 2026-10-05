// svgstore.ts — the in-memory stand-in for the remembered-folder store. It has
// no imports on purpose: a vi.mock factory may import it without creating a
// cycle through the panel that the mock is installed for.
export const stored = new Map<string, unknown>();
