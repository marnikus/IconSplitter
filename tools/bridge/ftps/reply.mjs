// reply.mjs — RFC 959 FTP control-channel reply parser & input validation.

export class FtpsError extends Error {
  constructor(code, message, serverCertSha256 = null) {
    super(message);
    this.code = code;
    this.serverCertSha256 = serverCertSha256;
  }
}

export function describeSocketError(err, fallback = "socket connection failed") {
  if (typeof err?.message === "string" && err.message.trim() !== "") return err.message.trim();
  if (Array.isArray(err?.errors)) {
    for (const sub of err.errors) {
      if (typeof sub?.message === "string" && sub.message.trim() !== "") return sub.message.trim();
      if (typeof sub?.code === "string" && sub.code !== "") return `connect ${sub.code}`;
    }
  }
  if (typeof err?.code === "string" && err.code !== "") return `connect ${err.code}`;
  return fallback;
}

export function assertSafeCommandToken(value, label) {
  if (typeof value !== "string" || /[\r\n\0]/.test(value)) {
    throw new FtpsError("bad-request", `invalid ${label}`);
  }
}

export function assertSafeFileName(fileName) {
  assertSafeCommandToken(fileName, "filename");
  const trimmed = fileName.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    throw new FtpsError("bad-request", "invalid upload filename");
  }
  return trimmed;
}

/**
 * Buffers lines on a Duplex stream and yields complete `{ code, text }` replies,
 * handling both single-line (`220 Ready`) and multi-line (`220-...\r\n220 End`) RFC 959 replies.
 */
export function createReplyReader(initialStream) {
  let stream = initialStream;
  let buffer = "";
  let multiCode = null;
  let multiLines = [];
  const queue = [];
  let waiter = null;
  let closedError = null;

  function deliver(item) {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve(item);
    } else {
      queue.push(item);
    }
  }

  function fail(err) {
    closedError = err;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.reject(err);
    }
  }

  function consumeLine(line) {
    if (multiCode !== null) {
      multiLines.push(line);
      if (line.startsWith(`${multiCode} `)) {
        const code = Number(multiCode);
        const text = multiLines.join("\n");
        multiCode = null;
        multiLines = [];
        deliver({ code, text });
      }
      return;
    }
    const m = /^(\d{3})([- ])(.*)$/.exec(line);
    if (!m) return;
    if (m[2] === "-") {
      multiCode = m[1];
      multiLines = [line];
    } else {
      deliver({ code: Number(m[1]), text: line });
    }
  }

  function onData(chunk) {
    buffer += chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      consumeLine(line);
    }
  }

  function onError(err) {
    fail(err instanceof FtpsError ? err : new FtpsError("network", describeSocketError(err, "socket error")));
  }

  function onClose() {
    fail(new FtpsError("network", "FTPS control connection closed unexpectedly"));
  }

  function bind(s) {
    s.on("data", onData);
    s.on("error", onError);
    s.on("close", onClose);
  }

  function unbind(s) {
    s.off("data", onData);
    s.off("error", onError);
    s.off("close", onClose);
  }

  bind(stream);

  return {
    replaceStream(nextStream) {
      unbind(stream);
      buffer = "";
      closedError = null;
      stream = nextStream;
      bind(stream);
    },
    get stream() {
      return stream;
    },
    nextReply(timeoutMs) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (closedError) return Promise.reject(closedError);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (waiter) waiter = null;
          reject(new FtpsError("timeout", `FTPS server timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
        waiter = {
          resolve: (val) => { clearTimeout(timer); resolve(val); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        };
      });
    },
  };
}
