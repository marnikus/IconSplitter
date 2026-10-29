// browser.mjs — finds, launches and stops the Chrome/Edge instance that drives
// the Getty contributor page. Headless by default so an upload runs in the
// background without stealing focus; GETTY_WEB_HEADED=1 shows the window for
// watching a run or clearing an interactive challenge. Zero dependencies.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LAUNCH_TIMEOUT_MS = 25000;

/** Absolute browser candidates per platform (Edge is the Windows fallback). */
function absoluteCandidates(env) {
  const programFiles = env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = env.LOCALAPPDATA ?? "";
  return [
    env.GETTY_WEB_BROWSER ?? "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/snap/bin/chromium",
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Chromium", "Application", "chrome.exe"),
  ].filter((candidate) => candidate !== "");
}

/** PATH lookup without a shell (Windows PATH uses `;`, POSIX `:`). */
function fromPath(env, names) {
  const dirs = String(env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".exe", ""] : [""];
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

export const BROWSER_FIX = "install Google Chrome or Microsoft Edge, or set GETTY_WEB_BROWSER to the browser executable, or set GETTY_WEB_CDP to an already-running Chrome DevTools endpoint (--remote-debugging-port=9222)";

/** The browser executable to launch, or an honest fix hint. */
export function findBrowser(env = process.env) {
  const candidates = absoluteCandidates(env);
  const found = candidates.find((candidate) => existsSync(candidate))
    ?? fromPath(env, ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "chrome", "msedge"]);
  return found ? { found: true, path: found } : { found: false, path: null, fix: BROWSER_FIX };
}

function launchArgs(profileDir, headed) {
  const args = [
    headed ? "" : "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking", "--disable-sync", "--disable-translate",
    "--disable-features=Translate,MediaRouter", "--mute-audio",
    "--remote-allow-origins=*",
    "about:blank",
  ];
  return args.filter(Boolean);
}

/** Removes a DevToolsActivePort left behind by an earlier run. */
function clearActivePort(dir) {
  try { rmSync(path.join(dir, "DevToolsActivePort"), { force: true }); } catch { /* nothing to clear */ }
}

/** Reads Chrome's DevToolsActivePort file: line 1 port, line 2 browser path. */
function readActivePort(profileDir) {
  try {
    const [port, wsPath] = readFileSync(path.join(profileDir, "DevToolsActivePort"), "utf8").split("\n");
    const number = Number(port);
    if (!Number.isInteger(number) || number <= 0 || !wsPath?.startsWith("/devtools/")) return null;
    return { port: number, wsPath: wsPath.trim() };
  } catch {
    return null;
  }
}

/** Attach-mode endpoint: only a loopback DevTools URL is ever contacted. */
export function parseCdpEndpoint(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!["127.0.0.1", "::1", "localhost"].includes(host)) return null;
    return url;
  } catch {
    return null;
  }
}

async function browserSocketFromHttp(endpoint) {
  return socketFromPort(Number(endpoint.port || 9222), 5000);
}

/**
 * A reusable profile directory when the user asked for one, else `null` (a
 * throwaway profile). Reusing a profile is what stops Getty's "remember this
 * device" verification from firing on every run.
 */
export function resolveProfileDir(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "" ? null : path.resolve(value);
}

/** Lock files a running Chrome/Edge keeps inside its profile folder. */
const PROFILE_LOCKS = ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"];

/** Lock file names present in a profile folder (a browser may already own it). */
export function profileLocks(dir) {
  const value = typeof dir === "string" ? dir.trim() : "";
  if (value === "") return [];
  return PROFILE_LOCKS.filter((name) => existsSync(path.join(value, name)));
}

/**
 * Whether a profile folder can be reused: attach to a browser that already
 * answers on its DevTools port, launch in a free folder, and never fight a
 * browser that holds the folder without exposing a port.
 */
export function decideProfileUse({ locked, answers }) {
  if (answers) return "attach";
  return locked ? "busy" : "launch";
}

/** The DevTools WebSocket of one loopback port, or null when nothing answers. */
async function socketFromPort(port, timeoutMs = 2000) {
  if (!Number.isInteger(port) || port <= 0) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json();
    const socket = typeof body?.webSocketDebuggerUrl === "string" ? body.webSocketDebuggerUrl : "";
    return /^ws:\/\/(127\.0\.0\.1|\[::1\]|localhost)[:/]/.test(socket) ? socket : null;
  } catch {
    return null;
  }
}

/** A browser already running on this profile folder, if its port still answers. */
async function existingBrowser(dir, probe) {
  const active = readActivePort(dir);
  if (!active) return null;
  const socket = await probe(active.port);
  return socket === null ? null : { port: active.port, socket };
}

/** Closes the browser including its child processes (Windows keeps a tree). */
function killTree(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32" && typeof child.pid === "number") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      return;
    } catch {
      // fall through to the plain kill below
    }
  }
  try { child.kill(); } catch { /* already gone */ }
}

function profileBusyFix(dir) {
  return `the Chrome/Edge profile folder ${dir} is in use by a browser window that does not expose a DevTools port — close that browser window (or delete the folder) and retry, or set GETTY_WEB_CDP`;
}

/**
 * Launches a browser profile and returns its loopback DevTools WebSocket.
 * `stop()` closes the browser; only a throwaway profile is deleted. The socket
 * is verified before it is handed out, so a stale DevToolsActivePort from a
 * previous run is never mistaken for a live browser.
 */
export async function launchBrowser(options = {}) {
  const found = findBrowser(options.env ?? process.env);
  if (!found.found) return { ok: false, code: "browser", reason: found.fix };
  const probe = options.probeSocket ?? socketFromPort;
  const spawnFn = options.spawnFn ?? spawn;
  const reusable = resolveProfileDir(options.profileDir);
  if (reusable !== null) {
    const running = await existingBrowser(reusable, probe);
    if (running) return { ok: true, ...running, stop: () => {} };
    const locked = profileLocks(reusable).length > 0;
    if (decideProfileUse({ locked, answers: false }) === "busy") {
      return { ok: false, code: "browser", reason: profileBusyFix(reusable) };
    }
    clearActivePort(reusable);
  }
  const profileDir = reusable ?? mkdtempSync(path.join(tmpdir(), "getty-web-profile-"));
  const child = spawnFn(found.path, launchArgs(profileDir, options.headed === true), { stdio: "ignore" });
  const stop = () => {
    killTree(child);
    if (reusable !== null) return;
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* profile already gone */ }
  };
  const deadline = Date.now() + (options.timeoutMs ?? LAUNCH_TIMEOUT_MS);
  let lastPort = null;
  while (Date.now() < deadline) {
    const active = readActivePort(profileDir);
    if (active) {
      lastPort = active.port;
      const socket = await probe(active.port);
      if (socket) return { ok: true, port: active.port, socket, stop };
    }
    if (child.exitCode !== null && active === null && lastPort === null) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  stop();
  const where = reusable === null ? "the temporary profile" : `the profile folder ${reusable}`;
  const port = lastPort === null ? "" : ` (DevTools port ${lastPort} did not accept a connection)`;
  return {
    ok: false,
    code: "browser",
    reason: `the browser did not open a usable DevTools port${port} — close any Chrome/Edge window using ${where} and retry, or set GETTY_WEB_CDP`,
  };
}

/** Attach to a browser the user started, else launch one. */
export async function connectBrowser(options = {}) {
  const endpoint = parseCdpEndpoint(options.cdpUrl ?? (options.env ?? process.env).GETTY_WEB_CDP);
  if (!endpoint) return launchBrowser(options);
  try {
    const socket = endpoint.protocol === "ws:" ? endpoint.href : await browserSocketFromHttp(endpoint);
    if (!socket) return { ok: false, code: "browser", reason: "the DevTools endpoint did not return a browser WebSocket" };
    return { ok: true, port: Number(endpoint.port || 9222), socket, stop: () => {} };
  } catch (err) {
    return { ok: false, code: "browser", reason: `cannot reach GETTY_WEB_CDP: ${(err).message}` };
  }
}
