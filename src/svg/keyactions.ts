// keyactions.ts — the API-key actions of the Generate SVG tab. The key itself
// never enters the model (RULE 20): only a masked form does. Saving never
// throws and reports whether the write really persisted, because a silent
// failure is what made the Save button look broken.

import { useCallback, useRef } from "react";
import { clearApiKey, saveApiKey } from "./keystore";
import { logKey } from "./runlog";
import type { SvgCtx, Slice } from "./actions";

export function useKeyActions(ctx: SvgCtx): Slice<"saveKey" | "forgetKey"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const saveKey = useCallback((value: string) => {
    void (async () => {
      const c = latest.current;
      const trimmed = value.trim();
      // Never throws, and reports whether the write really persisted — a
      // silent failure here is what made the Save button look broken.
      const stored = await saveApiKey(trimmed);
      c.refs.key.current = trimmed === "" ? null : trimmed;
      c.dispatch({ type: "key", key: c.refs.key.current });
      reportSave(c, trimmed === "", stored);
    })();
  }, []);
  const forgetKey = useCallback(() => {
    void (async () => {
      const c = latest.current;
      await clearApiKey();
      c.refs.key.current = null;
      c.dispatch({ type: "key", key: null });
      logKey("clear");
      c.say("API key cleared from this device");
    })();
  }, []);
  return { saveKey, forgetKey };
}

/** Says — in the toast and in the log — where the key went, never the key. */
function reportSave(c: SvgCtx, cleared: boolean, stored: boolean): void {
  logKey(cleared ? "clear" : "save", stored ? "device" : "session");
  if (cleared) c.say("API key cleared from this device");
  else if (stored) c.say("API key stored on this device only");
  else c.say("API key kept for this session only — browser storage refused it", true);
}
