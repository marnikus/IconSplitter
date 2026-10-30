// @vitest-environment node
// The sign-in has to survive a browser restart: Chrome only writes its cookie
// store on a real exit, so the helper snapshots the session cookies into the
// profile folder and restores them before the contributor page loads. These
// tests use a recording CDP connection and a temp profile folder — no browser.

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE_FILE, restoreSessionCookies, saveSessionCookies, sessionCookiePath,
} from "../tools/bridge/gettyweb/sessioncookies.mjs";
import { acceptedOf, outcomesOf, pendingOf } from "../tools/bridge/gettyweb/session.mjs";

const COOKIE = {
  name: "esp_session", value: "s3cr3t-token", domain: ".gettyimages.com", path: "/",
  expires: 1893456000, httpOnly: true, secure: true, sameSite: "Lax", session: false, size: 60,
};

class FakeConnection {
  calls: { method: string; params: Record<string, unknown> }[] = [];
  cookies: unknown[] = [COOKIE];
  fail = false;
  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ method, params });
    if (this.fail) return Promise.reject(new Error("socket closed"));
    if (method === "Storage.getCookies") return Promise.resolve({ cookies: this.cookies });
    return Promise.resolve({});
  }
}

function tempProfile(): string {
  return mkdtempSync(path.join(tmpdir(), "getty-web-cookies-test-"));
}

describe("Getty web remembered cookies", () => {
  it("names the snapshot inside the profile folder only", () => {
    expect(sessionCookiePath("   ")).toBeNull();
    expect(sessionCookiePath("/tmp/getty-profile")).toBe(path.join(path.resolve("/tmp/getty-profile"), SESSION_COOKIE_FILE));
  });

  it("writes the browser's cookies into the profile as a private file", async () => {
    const dir = tempProfile();
    try {
      const connection = new FakeConnection();
      const saved = await saveSessionCookies(connection, dir);
      expect(saved).toEqual({ saved: 1, file: path.join(dir, SESSION_COOKIE_FILE) });
      const written = JSON.parse(readFileSync(path.join(dir, SESSION_COOKIE_FILE), "utf8"));
      expect(written.cookies).toEqual([{
        name: "esp_session", value: "s3cr3t-token", domain: ".gettyimages.com", path: "/",
        expires: 1893456000, httpOnly: true, secure: true, sameSite: "Lax",
      }]);
      // Only the owner may read the session token.
      expect(statSync(path.join(dir, SESSION_COOKIE_FILE)).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("puts the snapshot back before the page is visited", async () => {
    const dir = tempProfile();
    try {
      writeFileSync(path.join(dir, SESSION_COOKIE_FILE), JSON.stringify({ cookies: [COOKIE] }));
      const connection = new FakeConnection();
      connection.cookies = [];
      const restored = await restoreSessionCookies(connection, dir);
      expect(restored.restored).toBe(1);
      expect(connection.calls.map((call) => call.method)).toEqual(["Storage.getCookies", "Storage.setCookies"]);
      const sent = connection.calls[1].params.cookies as { name: string }[];
      expect(sent.map((cookie) => cookie.name)).toEqual(["esp_session"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a cookie the live browser already has instead of overwriting it", async () => {
    const dir = tempProfile();
    try {
      writeFileSync(path.join(dir, SESSION_COOKIE_FILE), JSON.stringify({ cookies: [COOKIE] }));
      const connection = new FakeConnection();
      // The browser holds a newer token for the same name/domain.
      connection.cookies = [{ ...COOKIE, value: "newer" }];
      const restored = await restoreSessionCookies(connection, dir);
      expect(restored.restored).toBe(0);
      expect(connection.calls.map((call) => call.method)).toEqual(["Storage.getCookies"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does nothing without a named profile, a snapshot, or a usable cookie", async () => {
    const dir = tempProfile();
    try {
      const connection = new FakeConnection();
      expect(await restoreSessionCookies(connection, "")).toEqual({ restored: 0, file: null });
      expect(await saveSessionCookies(connection, "")).toEqual({ saved: 0, file: null });
      expect(await restoreSessionCookies(connection, dir)).toEqual({
        restored: 0, file: path.join(dir, SESSION_COOKIE_FILE),
      });
      writeFileSync(path.join(dir, SESSION_COOKIE_FILE), JSON.stringify({ cookies: [{ name: "", value: "" }, null] }));
      expect((await restoreSessionCookies(connection, dir)).restored).toBe(0);
      connection.cookies = [];
      expect((await saveSessionCookies(connection, dir)).saved).toBe(0);
      expect(connection.calls.filter((call) => call.method === "Storage.setCookies")).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never throws or prints when the browser or the file misbehaves", async () => {
    const dir = tempProfile();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const connection = new FakeConnection();
      connection.fail = true;
      expect(await saveSessionCookies(connection, dir)).toMatchObject({ saved: 0 });
      writeFileSync(path.join(dir, SESSION_COOKIE_FILE), "{not json");
      expect(await restoreSessionCookies(connection, dir)).toMatchObject({ restored: 0 });
      expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("s3cr3t-token");
    } finally {
      log.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A file counts as uploaded only when its card carries Getty's own "Ready to
// submit" icon. The reading that decides is the last one — taken after the
// grid-wide metadata save — so the attach-phase counts can never claim a file
// that Getty has not validated.
describe("Getty web accepted files", () => {
  const attach = { uploaded: ["star_01.jpg", "star_01.eps"], failed: [], namesSeen: ["star_01.jpg", "star_01.eps"] };

  it("takes the cards' own Ready to submit icons, not the arrival phase", () => {
    const read = { ...attach, readyToSubmit: ["star_01.jpg", "star_01.eps"], cardsPresent: true };
    expect(acceptedOf(read)).toEqual(["star_01.jpg", "star_01.eps"]);
  });

  it("is empty when no card showed the icon, even though every file was listed", () => {
    // The user's batch: 12 of 14 pictures were on the page, none proven ready.
    expect(acceptedOf({ ...attach, readyToSubmit: [], cardsPresent: true })).toEqual([]);
  });

  it("reads the per-card truth when the page reported it", () => {
    const read = {
      cardsPresent: true,
      contributions: [
        { name: "star_01.eps", stem: "star_01", id: "2302700699", state: "ready", picture: true, ready: true },
        { name: "moon_02.eps", stem: "moon_02", id: "2302700733", state: "arrived", picture: true, ready: false },
      ],
    };
    expect(acceptedOf(read)).toEqual(["star_01.eps"]);
    expect(outcomesOf(read)).toEqual([
      { name: "star_01.eps", stem: "star_01", state: "ready", picture: true, ready: true, id: "2302700699" },
      { name: "moon_02.eps", stem: "moon_02", state: "arrived", picture: true, ready: false, id: "2302700733" },
    ]);
    expect(pendingOf(read, ["star_01.jpg", "moon_02.eps"])).toEqual(["moon_02.eps"]);
  });

  it("says nothing about a run that never read a page", () => {
    expect(acceptedOf(undefined)).toEqual([]);
    expect(outcomesOf(null)).toEqual([]);
  });
});
