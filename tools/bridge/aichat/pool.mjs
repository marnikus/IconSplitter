// pool.mjs — the one ChatGPT page the helper keeps open between turns, and the
// rule that only ONE turn runs at a time. Knows nothing about browsers or HTTP:
// `deps.open` supplies the page (browser.mjs in production, a fake in tests).
// The reference image is staged as a private temp PNG only for the attach and
// removed right after. Progress is kept for the latest turn only.

/* global AbortController */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runChatTurn } from "./chatflow.mjs";

const BUSY = { ok: false, code: "busy", reason: "a ChatGPT web generation is already running — wait for it, or cancel it" };

function stageImage(bytes) {
  const dir = mkdtempSync(path.join(tmpdir(), "aichat-image-"));
  const file = path.join(dir, "reference.png");
  writeFileSync(file, bytes);
  return { file, drop: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ } } };
}

function pageFailure(err) {
  return { ok: false, code: "page", reason: `the ChatGPT page could not be driven: ${String(err?.message ?? "").slice(0, 200)}` };
}

/** The turn pool. `deps.open()` → `{ ok, page, close, closed? }`; `deps.turnOptions` tunes polling (tests). */
export function createAichat(deps) {
  let opened = null;
  let running = null;
  let latest = null;
  const mark = (key, phase) => { latest = { key, phase, at: Date.now() }; };
  const drop = () => { opened?.close(); opened = null; };
  const pageOf = async () => {
    if (opened !== null && opened.closed?.() !== true) return { ok: true, page: opened.page };
    const next = await deps.open();
    if (next.ok) opened = next;
    return next;
  };
  const turn = async (input, signal) => {
    const staged = stageImage(input.image);
    try {
      const page = await pageOf();
      if (!page.ok) return page;
      return await runChatTurn(page.page, { ...input, imagePath: staged.file }, {
        ...deps.turnOptions, signal, onPhase: (phase) => mark(input.sessionKey, phase),
      });
    } catch (err) {
      drop();
      return pageFailure(err);
    } finally {
      staged.drop();
    }
  };
  return {
    busy: () => running !== null,
    progress: (key) => (latest !== null && key !== "" && latest.key === key ? { phase: latest.phase, at: latest.at } : null),
    /** Cancels the running turn named by `key`; a nameless cancel touches nothing. */
    cancel(key) {
      if (running === null || typeof key !== "string" || key === "" || running.key !== key) return false;
      running.controller.abort();
      return true;
    },
    close: drop,
    async send(input) {
      if (running !== null) return BUSY;
      const controller = new AbortController();
      const key = input.sessionKey ?? "";
      const onAbort = () => controller.abort();
      input.signal?.addEventListener("abort", onAbort, { once: true });
      running = { key, controller };
      mark(key, "opening");
      try {
        const out = await turn({ ...input, sessionKey: key }, controller.signal);
        mark(key, out.ok ? "done" : "failed");
        return out;
      } finally {
        input.signal?.removeEventListener("abort", onAbort);
        running = null;
      }
    },
  };
}
