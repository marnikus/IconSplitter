// browser.mjs — the ChatGPT web generation's browser: the shared launcher
// (../webdriver/browser.mjs) bound to this feature's own names and profile.
// Visible by default: ChatGPT needs a person to sign in once and may show a
// check. The sign-in lives in a dedicated profile folder, never the user's own.

import { homedir } from "node:os";
import path from "node:path";
import { connectBrowser, findBrowser } from "../webdriver/browser.mjs";
import { openCdp } from "../webdriver/cdp.mjs";
import { restoreSessionCookies, saveSessionCookies } from "../webdriver/cookies.mjs";
import { cdpChatPage } from "./chatpage.mjs";

export const AICHAT_NAMING = Object.freeze({
  browserEnv: "AICHAT_BROWSER", cdpEnv: "AICHAT_CDP", tempPrefix: "aichat-profile-", retry: "retry the web generation",
});

/** The profile folder that keeps the ChatGPT sign-in between runs. */
export function aichatProfileDir(env = process.env) {
  const raw = typeof env.AICHAT_PROFILE === "string" ? env.AICHAT_PROFILE.trim() : "";
  return raw !== "" ? path.resolve(raw) : path.join(homedir(), ".iconsplitter", "chatgpt-profile");
}

export function aichatHeaded(env = process.env) {
  return env.AICHAT_HEADLESS !== "1";
}

/** `/health` block; never launches a browser. */
export function aichatHealth(env = process.env) {
  return {
    ready: true, browser: findBrowser(env, AICHAT_NAMING).found ? "found" : "missing",
    headed: aichatHeaded(env), profile: aichatProfileDir(env),
  };
}

async function attachPage(connection) {
  const target = await connection.send("Target.createTarget", { url: "about:blank" });
  const attached = await connection.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  return attached.sessionId;
}

/**
 * Launches (or attaches to) the browser and opens one page in it, in the shape
 * the turn pool (pool.mjs) expects: `{ ok, page, close, closed }`.
 */
export async function openChatBrowser(env = process.env) {
  const profileDir = aichatProfileDir(env);
  const headed = aichatHeaded(env);
  const browser = await connectBrowser({ naming: AICHAT_NAMING, headed, profileDir, env });
  if (!browser.ok) return browser;
  const connection = openCdp(browser.socket, { timeoutMs: 60_000 });
  try {
    await connection.ready;
    const sessionId = await attachPage(connection);
    await restoreSessionCookies(connection, profileDir);
    const close = () => {
      void saveSessionCookies(connection, profileDir).catch(() => null).finally(() => {
        connection.close();
        browser.stop({ keepOpen: headed });
      });
    };
    return { ok: true, page: cdpChatPage(connection, sessionId), close, closed: () => connection.closed !== null };
  } catch (err) {
    connection.close();
    browser.stop({ force: true });
    return { ok: false, code: "browser", reason: `the browser could not be driven: ${String(err?.message ?? "").slice(0, 200)}` };
  }
}
