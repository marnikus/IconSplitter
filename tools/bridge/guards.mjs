// guards.mjs — one upload's timeout must never take the helper down. Node kills a
// process on an unhandled rejection or an uncaught exception, and either one can
// come from a socket that the user already cancelled (a `STOR` reply timer that
// fires after `/ftps/close`, a data connection that stalls during the TLS
// handshake). The helper logs what happened — without a credential or a file name
// of the user's — and keeps serving; the request that owned the socket already got
// its failure.

import { describeSocketError } from "./ftps/reply.mjs";

/** Secrets never reach the log: only the error's own message, trimmed and short. */
export function safeReason(err) {
  const text = typeof err?.message === "string" && err.message.trim() !== ""
    ? err.message.trim()
    : describeSocketError(err, "unknown error");
  return text.replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Installs the two process guards. Returns the uninstaller, so a test can prove
 * the handler does nothing but log. Never calls `process.exit`.
 */
export function installCrashGuards(target, options = {}) {
  const log = typeof options.log === "function" ? options.log : () => undefined;
  const onError = typeof options.onError === "function" ? options.onError : () => undefined;
  const onRejection = (err) => {
    onError("rejection", err);
    log(`a background failure was logged, not fatal: ${safeReason(err)}`);
  };
  const onException = (err) => {
    onError("exception", err);
    log(`an error outside a request was logged, not fatal: ${safeReason(err)}`);
  };
  target.on("unhandledRejection", onRejection);
  target.on("uncaughtException", onException);
  return () => {
    target.off("unhandledRejection", onRejection);
    target.off("uncaughtException", onException);
  };
}

/**
 * Marks a promise as observed without changing it: for work that is started
 * before it is awaited (a `STOR` reply racing the data-channel TLS handshake),
 * where an early rejection would otherwise be unhandled.
 */
export function observed(promise) {
  Promise.resolve(promise).catch(() => undefined);
  return promise;
}
