// webchatstore.ts — the stored web generation settings (lib/webchatprefs) and
// one subscription, so the bulk bar's checkbox, the LIVE WEB popup and a run
// that moved to a new chat all see the same value at once (RULE 24).

import { useSyncExternalStore } from "react";
import { DEFAULT_WEBCHAT_PREFS, parseWebChatPrefs, type WebChatPrefs } from "../lib/webchatprefs";
import { readKey, writeKey } from "../state/safestorage";

export const WEBCHAT_KEY = "iconSplitter.svg.webchat.v1";

const listeners = new Set<() => void>();
let cached: { text: string | null; prefs: WebChatPrefs } | null = null;

export function loadWebChat(): WebChatPrefs {
  const text = readKey(WEBCHAT_KEY);
  if (cached !== null && cached.text === text) return cached.prefs;
  cached = { text, prefs: parseStored(text) };
  return cached.prefs;
}

function parseStored(text: string | null): WebChatPrefs {
  if (text === null) return DEFAULT_WEBCHAT_PREFS;
  try {
    return parseWebChatPrefs(JSON.parse(text));
  } catch {
    return DEFAULT_WEBCHAT_PREFS;
  }
}

export function saveWebChat(prefs: WebChatPrefs): void {
  writeKey(WEBCHAT_KEY, JSON.stringify(parseWebChatPrefs(prefs)));
  for (const listener of listeners) listener();
}

/** Merges one change into the stored settings. */
export function patchWebChat(patch: Partial<WebChatPrefs>): void {
  saveWebChat({ ...loadWebChat(), ...patch });
}

/** A run that restarted in a new chat replaces the saved URL with it. */
export function saveWebChatUrl(url: string): void {
  patchWebChat({ url });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useWebChatPrefs(): WebChatPrefs {
  return useSyncExternalStore(subscribe, loadWebChat, loadWebChat);
}
