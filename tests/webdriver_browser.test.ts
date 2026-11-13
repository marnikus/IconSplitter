// @vitest-environment node
// The shared browser layer (tools/bridge/webdriver) belongs to no feature:
// every env name and user hint comes from the caller's naming, so a ChatGPT
// failure never tells the user to set a Getty variable and a Getty override
// never redirects the ChatGPT browser. The Getty shim keeps its exact names.

import { describe, expect, it } from "vitest";
import { browserFix, cdpEndpointOf, findBrowser } from "../tools/bridge/webdriver/browser.mjs";
import { BROWSER_FIX, GETTY_NAMING } from "../tools/bridge/gettyweb/browser.mjs";
import { AICHAT_NAMING } from "../tools/bridge/aichat/browser.mjs";

const NOWHERE = "/nonexistent/browser-for-naming-test";

describe("webdriver naming", () => {
  it("names only the caller's variables in its fix hint", () => {
    const fix = browserFix(AICHAT_NAMING);
    expect(fix).toContain("AICHAT_BROWSER");
    expect(fix).toContain("AICHAT_CDP");
    expect(fix).not.toContain("GETTY");
    expect(BROWSER_FIX).toBe(browserFix(GETTY_NAMING));
    expect(BROWSER_FIX).toContain("GETTY_WEB_CDP");
  });

  it("honours the caller's browser override and ignores another feature's", () => {
    const own = findBrowser({ AICHAT_BROWSER: process.execPath, PATH: "" }, AICHAT_NAMING);
    expect(own).toMatchObject({ found: true, path: process.execPath });
    const foreign = findBrowser({ GETTY_WEB_BROWSER: process.execPath, PATH: "" }, AICHAT_NAMING);
    expect(foreign.path).not.toBe(process.execPath);
    expect(findBrowser({ AICHAT_BROWSER: NOWHERE, PATH: "" }, AICHAT_NAMING).path).not.toBe(NOWHERE);
  });

  it("attaches only to the caller's own DevTools endpoint", () => {
    expect(cdpEndpointOf({ naming: AICHAT_NAMING, env: { GETTY_WEB_CDP: "http://127.0.0.1:9222" } })).toBeNull();
    expect(cdpEndpointOf({ naming: AICHAT_NAMING, env: { AICHAT_CDP: "http://127.0.0.1:9333" } })?.port).toBe("9333");
    expect(cdpEndpointOf({ naming: GETTY_NAMING, env: { GETTY_WEB_CDP: "http://127.0.0.1:9222" } })?.port).toBe("9222");
    expect(cdpEndpointOf({ naming: AICHAT_NAMING, cdpUrl: "http://127.0.0.1:9444", env: {} })?.port).toBe("9444");
    expect(cdpEndpointOf({ naming: AICHAT_NAMING, env: { AICHAT_CDP: "http://example.com:9222" } })).toBeNull();
  });
});
