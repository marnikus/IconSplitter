// browser.mjs — the Getty web upload's browser: the shared launcher in
// ../webdriver/browser.mjs bound to Getty's own names, so GETTY_WEB_BROWSER /
// GETTY_WEB_CDP steer only this feature and its hints say "retry the upload".
// Headless by default (GETTY_WEB_HEADED=1 or --getty-headed shows the window).

import * as core from "../webdriver/browser.mjs";

export const GETTY_NAMING = Object.freeze({
  browserEnv: "GETTY_WEB_BROWSER", cdpEnv: "GETTY_WEB_CDP", tempPrefix: "getty-web-profile-", retry: "retry the upload",
});

export const BROWSER_FIX = core.browserFix(GETTY_NAMING);

export function findBrowser(env = process.env) {
  return core.findBrowser(env, GETTY_NAMING);
}

export function launchBrowser(options = {}) {
  return core.launchBrowser({ ...options, naming: GETTY_NAMING });
}

export function connectBrowser(options = {}) {
  return core.connectBrowser({ ...options, naming: GETTY_NAMING });
}

export {
  cancelIdleClose, decideProfileUse, parseCdpEndpoint, profileLocks, profileProcessIds, resetProfile, resolveProfileDir,
} from "../webdriver/browser.mjs";
