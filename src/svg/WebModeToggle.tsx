// WebModeToggle.tsx — "Generate with web page" (2026-11-03): when checked,
// Generate / Regenerate open the LIVE WEB confirmation (the local helper types
// into the user's ChatGPT chat) instead of the API one. Stored, so it survives
// a reload.

import { patchWebChat, useWebChatPrefs } from "./webchatstore";

export default function WebModeToggle() {
  const prefs = useWebChatPrefs();
  return (
    <label className="svg-web-toggle" title="Generate through your ChatGPT chat in a browser window opened by the local helper, instead of the API">
      <input type="checkbox" className="svg-check" data-testid="svg-web-mode" checked={prefs.enabled}
        onChange={(e) => patchWebChat({ enabled: e.target.checked })} />
      {" "}Generate with web page
    </label>
  );
}
