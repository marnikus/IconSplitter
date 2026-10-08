// keyactions.ts — the API-key actions of the Generate SVG tab. The key itself
// never enters the model (RULE 20): only a masked form does. Saving never
// throws and reports whether the write really persisted, because a silent
// failure is what made the Save button look broken.

import { useCallback, useRef } from "react";
import { clearApiKey, saveApiKey } from "./keystore";
import type { SvgCtx, Slice } from "./actions";

export function useKeyActions(ctx: SvgCtx): Slice<"saveKey" | "forgetKey"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const saveKey = useCallback((value: string) => {
    void (async () => {
      const c = latest.current;
      // An empty field is a slip, not a deletion: it never touches the stored
      // key, and the toast says how to really clear one. Never throws.
      const outcome = await saveApiKey(value);
      if (outcome === "empty") return c.say("Type the key first — an empty field does not erase the stored one", true);
      const trimmed = value.trim();
      c.refs.key.current = trimmed;
      c.dispatch({ type: "key", key: trimmed, source: outcome });
      if (outcome === "device") c.say("API key stored on this device only");
      else c.say("API key kept for this session only — browser storage refused it", true);
    })();
  }, []);
  const forgetKey = useCallback(() => {
    void (async () => {
      const c = latest.current;
      await clearApiKey();
      c.refs.key.current = null;
      c.dispatch({ type: "key", key: null, source: "none" });
      c.say("API key cleared from this device");
    })();
  }, []);
  return { saveKey, forgetKey };
}
