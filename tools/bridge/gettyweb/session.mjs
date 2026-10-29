// session.mjs — one Getty contributor browser session: launch (or attach), sign
// in once, create one batch, then attach each staged icon to that batch. The
// session is reused for every item of an Upload run so the login and the batch
// happen exactly once. Files are staged in a private temp folder that is
// deleted when the session closes; nothing is ever logged.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { connectBrowser } from "./browser.mjs";
import { openCdp } from "./cdp.mjs";
import { attachFiles, createBatch, ensureSignedIn, openContributePage } from "./contribute.mjs";

const LOGIN_TIMEOUT_MS = 120000;
const UPLOAD_TIMEOUT_MS = 180000;

async function openPage(connection) {
  const target = await connection.send("Target.createTarget", { url: "about:blank" });
  const attached = await connection.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  return { targetId: target.targetId, sessionId: attached.sessionId };
}

/** Keeps the page file name but never a path segment from the user's disk. */
export function safeStagedName(fileName) {
  const leaf = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  const base = leaf.replace(/[^A-Za-z0-9._-]/g, "_");
  return base === "" || base === "." || base === ".." ? "icon.bin" : base;
}

function stageFiles(dir, files) {
  return files.map((file, index) => {
    const itemDir = path.join(dir, String(index));
    mkdirSync(itemDir, { recursive: true });
    const target = path.join(itemDir, safeStagedName(file.name));
    writeFileSync(target, file.bytes);
    return target;
  });
}

/** Signs in and prepares the batches page; returns a reusable session. */
export async function openGettySession(options) {
  const browser = await connectBrowser({ headed: options.headed, cdpUrl: options.cdpUrl, env: options.env });
  if (!browser.ok) return browser;
  const connection = openCdp(browser.socket);
  const cleanup = () => {
    connection.close();
    browser.stop();
  };
  try {
    await connection.ready;
    const page = await openPage(connection);
    const info = await openContributePage(connection, page.sessionId, options.url);
    const signedIn = info.signedIn ? { ok: true } : await ensureSignedIn(connection, page.sessionId, {
      creds: options.creds, timeoutMs: options.loginTimeoutMs ?? LOGIN_TIMEOUT_MS,
      onProgress: options.onProgress, signal: options.signal,
    });
    if (!signedIn.ok) {
      cleanup();
      return { ok: false, code: signedIn.code, reason: signedIn.reason };
    }
    return { ok: true, session: buildSession({ connection, page, browser, options, cleanup }) };
  } catch (err) {
    cleanup();
    return { ok: false, code: "browser", reason: (err).message || "the browser page could not be prepared" };
  }
}

function buildSession(ctx) {
  const { connection, page, options, cleanup } = ctx;
  const tempDir = mkdtempSync(path.join(tmpdir(), "getty-web-files-"));
  const state = { batchId: null };
  let closed = false;
  return {
    get batchId() { return state.batchId; },
    /** Creates the batch once for the whole run. */
    async ensureBatch(input) {
      if (state.batchId !== null) return { ok: true, batchId: state.batchId };
      const created = await createBatch(connection, page.sessionId, {
        batchName: input.batchName, submissionType: input.submissionType,
        briefCode: input.briefCode, onProgress: options.onProgress, signal: options.signal,
        timeoutMs: options.batchTimeoutMs,
      });
      if (created.ok) state.batchId = created.batchId;
      return created;
    },
    /** Stages bytes on this machine, then lets Getty's own uploader read them. */
    async upload(input) {
      const paths = stageFiles(tempDir, input.files);
      const result = await attachFiles(connection, page.sessionId, {
        paths, names: input.files.map((f) => f.name),
        timeoutMs: options.uploadTimeoutMs ?? UPLOAD_TIMEOUT_MS,
        onProgress: options.onProgress, signal: options.signal,
      });
      return { ...result, batchId: state.batchId };
    },
    close() {
      if (closed) return;
      closed = true;
      cleanup();
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* temp already gone */ }
    },
  };
}
