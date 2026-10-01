// ui/useRequestyKey.ts — secure-key availability and key management without
// exposing the credential to React preferences, history, logs or sidecars.

import { useCallback, useEffect, useState } from "react";
import { clearRequestyKey, hasRequestyKey, saveRequestyKey } from "../keyvault";

// ideal-size: 25 lines reason=credential availability, validation and secure save/remove state must share one hook so plaintext stays outside other state owners.
export function useRequestyKey() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setAvailable(await hasRequestyKey()); setError(null); }
    catch { setAvailable(false); setError("Encrypted key storage is unavailable in this browser."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = useCallback(async (value: string): Promise<boolean> => {
    const secret = value.trim();
    if (secret.length < 12 || secret.length > 512 || /\s/.test(secret)) {
      setError("Enter a valid Requesty API key; the value was not stored."); return false;
    }
    try { await saveRequestyKey(secret); setAvailable(true); setError(null); return true; }
    catch { setError("Could not save the key in encrypted local storage."); return false; }
  }, []);
  const remove = useCallback(async (): Promise<boolean> => {
    try { await clearRequestyKey(); setAvailable(false); setError(null); return true; }
    catch { setError("Could not remove the locally stored API key."); return false; }
  }, []);
  return { available, busy, error, refresh, save, remove, setError };
}
