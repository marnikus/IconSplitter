// Hotkeys.tsx — the keyboard surface of the Selection tab (spec §5, §11;
// design legend): A approve, D decline, ↑↓ navigate, Space fit / 100 % zoom,
// Escape close. It is active only while a pair is open, and never while the
// user is typing in a field or pressing Space on a focused button.

import { useEffect, useRef } from "react";
import { hotkeyAction, type HotkeyAction } from "../lib/reviewkeys";

export interface HotkeyHandlers {
  approve: () => void;
  decline: () => void;
  next: () => void;
  prev: () => void;
  zoom: () => void;
  close: () => void;
}

export default function Hotkeys({ enabled, handlers }: { enabled: boolean; handlers: HotkeyHandlers }) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => run(hotkeyAction(e.key, tagOf(e)), e, latest.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
  return null;
}

function run(action: HotkeyAction | null, e: KeyboardEvent, handlers: HotkeyHandlers): void {
  if (!action) return;
  e.preventDefault();
  handlers[action]();
}

function tagOf(e: KeyboardEvent): string {
  const target = e.target as HTMLElement | null;
  return target?.tagName ?? "";
}
