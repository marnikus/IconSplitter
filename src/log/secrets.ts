// secrets.ts — the in-memory registry of values the log must never print (RULE 20).
// A feature that holds a secret registers it here (the Generate SVG tab does so
// for the provider credential, when the user saves it); the log masks every
// registered value wherever it appears, even one of no recognisable shape.
// Memory only: nothing here is stored, exported or logged, and it is handed to
// the redactor as a plain list (RULE 3).

const secrets = new Set<string>();

export function watchSecret(value: string): void {
  const secret = value.trim();
  if (secret !== "") secrets.add(secret);
}

export function forgetSecret(value: string): void {
  secrets.delete(value.trim());
}

export const listSecrets = (): readonly string[] => [...secrets];

/** For tests and a full reset. */
export function resetSecrets(): void {
  secrets.clear();
}
