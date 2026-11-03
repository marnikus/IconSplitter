// session.mjs — the one ChatGPT browser page the helper keeps for web SVG
// generation. Reuses the Getty helper's browser launcher, CDP client and
// cookie snapshot (gettyweb/). One turn at a time; the reference image is staged
// as a private temp PNG only for the attach and removed right after. Nothing
// from the page or the prompt is ever logged.

/* global AbortController */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { connectBrowser } from "../gettyweb/browser.mjs";
import { openCdp } from "../gettyweb/cdp.mjs";
import { restoreSessionCookies, saveSessionCookies } from "../gettyweb/sessioncookies.mjs";
import { runChatTurn } from "./chatflow.mjs";
import { cdpChatPage } from "./chatpage.mjs";

/** The profile folder that keeps the ChatGPT sign-in between runs. */
export function aichatProfileDir(env = process.env) {
  const raw = typeof env.AICHAT_PROFILE === "string" ? env.AICHAT_PROFILE.trim() : "";
  return raw !== "" ? path.resolve(raw) : path.join(homedir(), ".iconsplitter", "chatgpt-profile");
}

/** Visible by default: ChatGPT needs a person to sign in once and may show checks. */
export function aichatHeaded(env = process.env) {
  return env.AICHAT_HEADLESS !== "1";
}

/** Launches (or attaches to) the browser and opens one page in it. */
export async function openChatBrowser(env = process.env) {
  const profileDir = aichatProfileDir(env);
  const headed = aichatHeaded(env);
  const browser = await connectBrowser({ headed, profileDir, cdpUrl: env.AICHAT_CDP ?? "", env });
  if (!browser.ok) return browser;
  const connection = openCdp(browser.socket, { timeoutMs: 60_000 });
  try {
    await connection.ready;
    const target = await connection.send("Target.createTarget", { url: "about:blank" });
    const attached = await connection.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await restoreSessionCookies(connection, profileDir);
    const close = () => {
      void saveSessionCookies(connection, profileDir).catch(() => null).finally(() => {
        connection.close();
        browser.stop({ keepOpen: headed });
      });
    };
    return { ok: true, page: cdpChatPage(connection, attached.sessionId), close, closed: () => connection.closed !== null };
  } catch (err) {
    connection.close();
    browser.stop({ force: true });
    return { ok: false, code: "browser", reason: `the browser could not be driven: ${String(err?.message ?? "").slice(0, 200)}` };
  }
}

function stageImage(bytes) {
  const dir = mkdtempSync(path.join(tmpdir(), "aichat-image-"));
  const file = path.join(dir, "reference.png");
  writeFileSync(file, bytes);
  return { file, drop: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ } } };
}

/**
 * The session pool (one page). `deps.open` opens the browser page; tests pass a
 * fake. `deps.turnOptions` tunes the polling (tests only).
 */
export function createAichat(deps = { open: () => openChatBrowser() }) {
  let opened = null;
  let running = null;
  const progress = new Map();
  const ensure = async () => {
    if (opened !== null && opened.closed?.() !== true) return { ok: true, page: opened.page };
    const next = await deps.open();
    if (!next.ok) return next;
    opened = next;
    return { ok: true, page: next.page };
  };
  const mark = (key, phase) => progress.set(key, { phase, at: Date.now() });
  return {
    busy: () => running !== null,
    progress: (key) => progress.get(key) ?? null,
    cancel(key) {
      if (running === null || (key && running.key !== key)) return false;
      running.controller.abort();
      return true;
    },
    close() {
      opened?.close();
      opened = null;
    },
    async send(input) {
      if (running !== null) return { ok: false, code: "busy", reason: "a ChatGPT web generation is already running — wait for it, or cancel it" };
      const key = input.sessionKey ?? "";
      running = { key, controller: new AbortController() };
      input.signal?.addEventListener?.("abort", () => running?.controller.abort(), { once: true });
      mark(key, "opening");
      const staged = stageImage(input.image);
      try {
        const page = await ensure();
        if (!page.ok) { mark(key, "failed"); return page; }
        const out = await runChatTurn(page.page, { ...input, imagePath: staged.file }, {
          ...deps.turnOptions, signal: running.controller.signal, onPhase: (phase) => mark(key, phase),
        });
        mark(key, out.ok ? "done" : "failed");
        return out;
      } catch (err) {
        mark(key, "failed");
        opened?.close();
        opened = null;
        return { ok: false, code: "page", reason: `the ChatGPT page could not be driven: ${String(err?.message ?? "").slice(0, 200)}` };
      } finally {
        staged.drop();
        running = null;
      }
    },
  };
}
