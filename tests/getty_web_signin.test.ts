// The sign-in half of a Getty web run: the helper must find whatever identifier
// field the page shows (e-mail or the numeric contributor ID), press the right
// control, come back to /contribute when Getty lands somewhere else, and — when
// it still fails — say which step stopped it without leaking the saved values.
// The page steps are the real driver functions; only CDP is faked.

import { describe, expect, it } from "vitest";
import { ensureSignedIn, signInFailure } from "../tools/bridge/gettyweb/contribute.mjs";
import type { CdpConnection } from "../tools/bridge/gettyweb/cdp.mjs";

const CREDS = { username: "1234567", password: "GettyPass!42" };
const CONTRIBUTE_URL = "https://esp.gettyimages.com/contribute";
const SIGNAL = new AbortController().signal;

const SIGNED_IN = { signedIn: true, path: "/contribute/batches", loginForm: { email: false, password: false }, challenge: false };
const EMAIL_STEP = {
  signedIn: false, path: "/log-in", loginForm: { email: true, password: true }, challenge: false,
};
const CHALLENGE_STEP = {
  signedIn: false, path: "/log-in/verify", loginForm: { email: false, password: false }, challenge: true,
};
const PASSWORD_ONLY = { signedIn: false, path: "/log-in", loginForm: { email: false, password: true }, challenge: false };
const ELSEWHERE = { signedIn: false, path: "/log-in/complete", loginForm: { email: false, password: false }, challenge: false };

class FakePage {
  steps: string[] = [];
  navigations: string[] = [];
  inserts: string[] = [];
  queue: Record<string, unknown[]>;
  defaults: Record<string, unknown>;

  constructor(queue: Record<string, unknown[]> = {}, defaults: Record<string, unknown> = {}) {
    this.queue = queue;
    this.defaults = defaults;
  }

  send(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === "Page.navigate") {
      this.navigations.push(String(params.url));
      return Promise.resolve({});
    }
    if (method === "Input.insertText") {
      this.inserts.push(String(params.text));
      return Promise.resolve({});
    }
    if (method !== "Runtime.evaluate") return Promise.resolve({});
    const expression = String(params.expression);
    if (expression === "document.readyState === 'complete'") return Promise.resolve({ result: { value: true } });
    const tail = expression.slice(expression.lastIndexOf("\n;return ("));
    const name = /\(function (\w+)/.exec(tail)?.[1] ?? "unknown";
    this.steps.push(name);
    const value = this.queue[name]?.length ? this.queue[name].shift() : this.defaults[name] ?? null;
    return Promise.resolve({ result: { value } });
  }
}

function connect(queue: Record<string, unknown[]> = {}, defaults: Record<string, unknown> = {}) {
  return new FakePage(queue, defaults) as unknown as CdpConnection & FakePage;
}

const options = (url = CONTRIBUTE_URL) => ({ creds: CREDS, url, timeoutMs: 150, pollMs: 5, signal: SIGNAL });

describe("Getty web sign-in", () => {
  it("fills the sign-in form and stops as soon as the Batches page renders", async () => {
    const cdp = connect(
      { readPageInfo: [EMAIL_STEP, SIGNED_IN], fillLoginForm: [{ filled: true, stage: "password", submitted: true }] },
    );
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result.ok).toBe(true);
    expect(cdp.steps).toEqual([
      "readPageInfo", "focusLoginField", "focusLoginField", "fillLoginForm", "submitLogin", "inspectSignIn", "readPageInfo",
    ]);
  });

  it("types the saved identifier and password as real input events", async () => {
    const cdp = connect({
      readPageInfo: [PASSWORD_ONLY, SIGNED_IN],
      focusLoginField: [{ focused: true, type: "text" }, { focused: true, type: "password" }],
      submitLogin: [{ submitted: true, method: "click", label: "Sign in" }],
      inspectSignIn: [{ title: "Sign in - ESP", inputs: ["text#username", "password#password"], angular: true }],
    });
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result.ok).toBe(true);
    expect(cdp.inserts).toEqual([CREDS.username, CREDS.password]);
  });

  it("presses the sign-in control a second time when filling did not submit", async () => {
    const cdp = connect(
      {
        readPageInfo: [PASSWORD_ONLY, PASSWORD_ONLY, SIGNED_IN],
        fillLoginForm: [{ filled: true, stage: "password", submitted: false }],
        submitLogin: [{ submitted: true, method: "keyboard", label: null }],
      },
    );
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result.ok).toBe(true);
    expect(cdp.steps.slice(0, 6)).toEqual([
      "readPageInfo", "focusLoginField", "focusLoginField", "fillLoginForm", "submitLogin", "inspectSignIn",
    ]);
    expect(cdp.steps.filter((name) => name === "submitLogin").length).toBeGreaterThan(1);
  });

  it("returns to the contributor page when sign-in lands somewhere else", async () => {
    const cdp = connect({ readPageInfo: [ELSEWHERE, SIGNED_IN] });
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result.ok).toBe(true);
    expect(cdp.navigations).toEqual([CONTRIBUTE_URL]);
  });

  it("asks for a visible browser window when Getty wants an interactive check", async () => {
    const cdp = connect({}, { readPageInfo: CHALLENGE_STEP });
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result).toMatchObject({ ok: false, code: "auth" });
    if (!result.ok) {
      expect(result.reason).toContain("--getty-headed");
      expect(result.reason).not.toContain(CREDS.password);
      expect(result.reason).not.toContain(CREDS.username);
    }
  });

  it("names the step that stalled instead of blaming the password", async () => {
    const cdp = connect({}, { readPageInfo: PASSWORD_ONLY, fillLoginForm: { filled: true, submitted: false }, submitLogin: { submitted: false } });
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result).toMatchObject({ ok: false, code: "auth" });
    if (!result.ok) expect(result.reason).toContain("no sign-in control");
  });

  it("keeps the timeout code when the page never shows a sign-in form or the Batches list", async () => {
    const cdp = connect({}, { readPageInfo: { signedIn: false, path: "/contribute", loginForm: { email: false, password: false }, challenge: false } });
    const result = await ensureSignedIn(cdp, "page-1", options());
    expect(result).toMatchObject({ ok: false, code: "timeout" });
  });

  it("aborts immediately when the run is cancelled", async () => {
    const aborted = AbortSignal.abort();
    const cdp = connect({}, { readPageInfo: SIGNED_IN });
    const result = await ensureSignedIn(cdp, "page-1", { ...options(), signal: aborted });
    expect(result).toMatchObject({ ok: false, code: "cancelled" });
    expect(cdp.steps).toEqual([]);
  });
});

describe("Getty web sign-in failure reasons", () => {
  it("distinguishes a challenge, an unsent form, the ID step and a rejected password", () => {
    expect(signInFailure(null, false)).toMatchObject({ ok: false, code: "timeout" });
    expect(signInFailure(CHALLENGE_STEP, true).reason).toContain("interactive verification");
    expect(signInFailure(EMAIL_STEP, false).reason).toContain("no sign-in control");
    expect(signInFailure({ loginForm: { email: true, password: false } }, true).reason).toContain("account ID");
    expect(signInFailure({ loginForm: { email: true, password: true } }, true).reason).toContain("password");
    expect(signInFailure({ loginForm: { email: true, password: true } }, false).reason).toContain("--getty-headed");
  });
});
