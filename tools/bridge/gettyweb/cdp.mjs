// cdp.mjs — minimal Chrome DevTools Protocol client over Node's built-in
// WebSocket (no npm dependencies, matching the rest of this helper). One
// browser connection, one flattened page session. Every method answers with
// the protocol result or throws a short, content-free error reason.

const DEFAULT_TIMEOUT_MS = 20000;

/** Serializes a page driver step: helper prelude + one self-contained function. */
export function stepExpression(prelude, stepSource, arg) {
  const payload = arg === undefined ? "" : JSON.stringify(arg);
  return `(() => {\n${prelude}\n;return (${stepSource})(${payload});\n})()`;
}

/**
 * Opens a CDP connection. `WebSocketImpl` is injectable so the framing and
 * pending-request bookkeeping can be tested without a browser.
 */
export function openCdp(url, options = {}) {
  const Impl = options.WebSocketImpl ?? globalThis.WebSocket;
  if (typeof Impl !== "function") throw new Error("this Node build has no WebSocket client");
  const socket = new Impl(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  let closedReason = null;

  function settle(id, message) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(String(message.error.message ?? "CDP error")));
    else entry.resolve(message.result ?? {});
  }

  function dispatch(message) {
    if (typeof message.id === "number") settle(message.id, message);
    const list = listeners.get(message.method) ?? [];
    for (const handler of list) handler(message.params ?? {}, message.sessionId);
  }

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      dispatch(message);
    });
    socket.addEventListener("error", () => reject(new Error("browser debugging socket failed")));
    socket.addEventListener("close", () => {
      closedReason = closedReason ?? "browser debugging socket closed";
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(closedReason));
      }
      pending.clear();
    });
    socket.addEventListener("open", () => resolve());
  });

  function send(method, params = {}, sessionId) {
    if (closedReason !== null) return Promise.reject(new Error(closedReason));
    const id = nextId;
    nextId += 1;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const answer = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
    socket.send(JSON.stringify(message));
    return answer;
  }

  function on(method, handler) {
    listeners.set(method, [...(listeners.get(method) ?? []), handler]);
  }

  function close() {
    closedReason = closedReason ?? "connection closed";
    try { socket.close(); } catch { /* already gone */ }
  }

  return { ready, send, on, close, get closed() { return closedReason; } };
}

/** Evaluates an expression in a page session and returns its JSON value. */
export async function evaluate(connection, expression, sessionId) {
  const result = await connection.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "page script failed";
    throw new Error(String(detail).split("\n")[0].slice(0, 300));
  }
  return result.result?.value;
}

/** Runs one driver step (prelude + step source) inside the page. */
export function runStep(connection, prelude, stepSource, arg, sessionId) {
  return evaluate(connection, stepExpression(prelude, stepSource, arg), sessionId);
}

/** Waits until `expression` returns a truthy JSON value. */
export async function waitFor(connection, expression, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const interval = options.intervalMs ?? 500;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(connection, expression, options.sessionId);
    if (last) return { ok: true, value: last };
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return { ok: false, value: last };
}

/** Types text as real input events into the focused element (key-event path). */
export async function insertText(connection, text, sessionId) {
  try {
    await connection.send("Input.insertText", { text: String(text ?? "") }, sessionId);
    return true;
  } catch {
    return false;
  }
}

/** Navigates the page and waits for the load event to settle. */
export async function navigate(connection, url, sessionId) {
  await connection.send("Page.enable", {}, sessionId);
  await connection.send("Page.navigate", { url }, sessionId);
  await waitFor(connection, "document.readyState === 'complete'", { sessionId, timeoutMs: 30000 });
}

/** Reloads the page, keeping its URL, and waits for it to be usable again. */
export async function reloadPage(connection, sessionId) {
  await connection.send("Page.enable", {}, sessionId);
  await connection.send("Page.reload", { ignoreCache: true }, sessionId);
  const loaded = await waitFor(connection, "document.readyState === 'complete'", { sessionId, timeoutMs: 30000 });
  return { ok: loaded.ok };
}

/**
 * Attaches files to a file input. `selector` picks the input; Chrome then fires
 * the real `change` event, which is what the page's uploader listens to.
 */
export async function setFiles(connection, files, options = {}) {
  const selector = options.selector ?? 'input[type="file"]';
  const found = await connection.send("Runtime.evaluate", {
    expression: `(() => { const list = document.querySelectorAll(${JSON.stringify(selector)}); return list[${options.index ?? 0}] ?? null; })()`,
    returnByValue: false, userGesture: true,
  }, options.sessionId);
  const objectId = found.result?.objectId;
  if (!objectId) return { ok: false, reason: "the upload page has no file input" };
  await connection.send("DOM.setFileInputFiles", { files, objectId }, options.sessionId);
  return { ok: true, reason: null };
}
