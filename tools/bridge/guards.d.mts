/** The error's own message, trimmed and short — never a credential. */
export function safeReason(err: unknown): string;

/** Anything with `on`/`off`, so a test can install the guards on an emitter. */
export interface GuardTarget {
  on(event: string, listener: (arg: unknown) => void): unknown;
  off(event: string, listener: (arg: unknown) => void): unknown;
}

/** Installs the two process guards; returns the uninstaller. Never exits. */
export function installCrashGuards(
  target: GuardTarget,
  options?: { log?: (line: string) => void; onError?: (kind: "rejection" | "exception", err: unknown) => void },
): () => void;

/** Marks a promise as observed without changing it. */
export function observed<T>(promise: Promise<T> | T): Promise<T> | T;
